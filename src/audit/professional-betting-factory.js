const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_MANIFEST_PATH = path.join(
  "governance",
  "professional-betting-factory.requirements.json"
);
const ACCEPTED_STATUSES = new Set([
  "implemented_local",
  "partial_local",
  "blocked_external",
  "prohibited_by_design"
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function lineNumbers(sourceLines) {
  const numbers = [];

  for (const range of sourceLines ?? []) {
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)) {
      continue;
    }

    for (let line = range.start; line <= range.end; line += 1) {
      numbers.push(line);
    }
  }

  return numbers;
}

function validateRequirement(requirement, sourceLineCount) {
  const issues = [];

  if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) {
    return ["Requirement must be an object."];
  }
  if (typeof requirement.id !== "string" || !/^[A-Z0-9-]+$/.test(requirement.id)) {
    issues.push("id must contain only uppercase letters, numbers, and hyphens.");
  }
  if (typeof requirement.category !== "string" || !requirement.category.trim()) {
    issues.push("category is required.");
  }
  if (typeof requirement.requirement !== "string" || !requirement.requirement.trim()) {
    issues.push("requirement text is required.");
  }
  if (!ACCEPTED_STATUSES.has(requirement.status)) {
    issues.push(`status must be one of ${Array.from(ACCEPTED_STATUSES).join(", ")}.`);
  }
  if (!Array.isArray(requirement.sourceLines) || requirement.sourceLines.length === 0) {
    issues.push("sourceLines must contain at least one range.");
  } else {
    requirement.sourceLines.forEach((range, index) => {
      if (
        !range ||
        !Number.isInteger(range.start) ||
        !Number.isInteger(range.end) ||
        range.start < 1 ||
        range.end < range.start ||
        range.end > sourceLineCount
      ) {
        issues.push(`sourceLines[${index}] is outside the source document.`);
      }
    });
  }
  if (!Array.isArray(requirement.evidence) || requirement.evidence.length === 0) {
    issues.push("evidence must contain at least one artifact or source record.");
  }
  if (requirement.status === "blocked_external" && !requirement.blocker) {
    issues.push("blocked_external requirements need a blocker explanation.");
  }
  if (requirement.status === "prohibited_by_design" && !requirement.prohibitionReason) {
    issues.push("prohibited_by_design requirements need a prohibition reason.");
  }

  return issues;
}

async function loadProfessionalBettingRequirements(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const manifestPath = path.resolve(rootDir, options.manifestPath ?? DEFAULT_MANIFEST_PATH);
  const contents = await fs.readFile(manifestPath, "utf8");

  return JSON.parse(contents);
}

async function inspectEvidence(evidence, options) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { valid: false, reason: "Evidence entry must be an object." };
  }
  if (typeof evidence.claim !== "string" || !evidence.claim.trim()) {
    return { valid: false, reason: "Evidence entry has no claim." };
  }

  if (evidence.path === "$SOURCE") {
    return { valid: true, resolvedPath: options.sourcePath };
  }
  if (typeof evidence.path !== "string" || !evidence.path.trim()) {
    return { valid: false, reason: "Evidence entry has no path." };
  }

  const resolvedPath = path.resolve(options.rootDir, evidence.path);
  let contents;

  try {
    contents = await fs.readFile(resolvedPath, "utf8");
  } catch (error) {
    return {
      valid: false,
      resolvedPath,
      reason: error?.code === "ENOENT" ? "Evidence file does not exist." : error.message
    };
  }

  if (typeof evidence.contains === "string" && !contents.includes(evidence.contains)) {
    return {
      valid: false,
      resolvedPath,
      reason: `Evidence marker was not found: ${evidence.contains}`
    };
  }

  return { valid: true, resolvedPath };
}

async function auditProfessionalBettingFactory(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const sourcePath = path.resolve(options.sourcePath);
  const manifest = options.manifest ?? await loadProfessionalBettingRequirements({ rootDir });
  const sourceContents = await fs.readFile(sourcePath, "utf8");
  const actualLineCount = sourceContents.split(/\r?\n/).length - (sourceContents.endsWith("\n") ? 1 : 0);
  const expectedLineCount = manifest.source?.lineCount;
  const expectedSha256 = manifest.source?.sha256;
  const requirements = Array.isArray(manifest.requirements) ? manifest.requirements : [];
  const idCounts = new Map();
  const coveredLines = new Set();
  const invalidRequirements = [];
  const missingEvidence = [];
  const statusCounts = {};
  const requirementResults = [];

  for (const requirement of requirements) {
    const id = requirement?.id ?? "<missing-id>";
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    statusCounts[requirement?.status ?? "unknown"] = (statusCounts[requirement?.status ?? "unknown"] ?? 0) + 1;

    const issues = validateRequirement(requirement, expectedLineCount);

    if (issues.length > 0) {
      invalidRequirements.push({ id, issues });
    }

    for (const line of lineNumbers(requirement?.sourceLines)) {
      coveredLines.add(line);
    }

    const evidenceResults = [];

    for (const evidence of requirement?.evidence ?? []) {
      const result = await inspectEvidence(evidence, { rootDir, sourcePath });
      evidenceResults.push({ ...evidence, ...result });

      if (!result.valid) {
        missingEvidence.push({ id, evidence, reason: result.reason });
      }
    }

    requirementResults.push({ id, status: requirement?.status ?? "unknown", issues, evidenceResults });
  }

  const duplicateIds = Array.from(idCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));
  const unaccountedLines = [];

  for (let line = 1; line <= expectedLineCount; line += 1) {
    if (!coveredLines.has(line)) {
      unaccountedLines.push(line);
    }
  }

  const unknownCount = statusCounts.unknown ?? 0;
  const sourceVerified = actualLineCount === expectedLineCount && sha256(sourceContents) === expectedSha256;
  const dispositionComplete =
    sourceVerified &&
    requirements.length > 0 &&
    duplicateIds.length === 0 &&
    unknownCount === 0 &&
    invalidRequirements.length === 0 &&
    missingEvidence.length === 0 &&
    unaccountedLines.length === 0;

  return {
    schemaVersion: "professional-betting-factory-audit/v1",
    generatedAt: new Date().toISOString(),
    source: {
      path: sourcePath,
      expectedSha256,
      actualSha256: sha256(sourceContents),
      expectedLineCount,
      actualLineCount,
      verified: sourceVerified,
      unaccountedLines
    },
    summary: {
      requirementCount: requirements.length,
      statusCounts,
      duplicateIds,
      unknownCount,
      invalidRequirements,
      missingEvidence
    },
    dispositionComplete,
    localImplementationComplete: dispositionComplete && (statusCounts.partial_local ?? 0) === 0,
    productionEvidenceComplete: dispositionComplete && (statusCounts.blocked_external ?? 0) === 0,
    requirementResults
  };
}

function formatSourceRanges(sourceLines) {
  return sourceLines
    .map((range) => range.start === range.end ? String(range.start) : `${range.start}-${range.end}`)
    .join(", ");
}

function renderProfessionalBettingFactoryMarkdown(manifest, audit) {
  const lines = [
    "# Professional Betting Factory Audit",
    "",
    `Generated: ${audit.generatedAt}`,
    "",
    "## Source Verification",
    "",
    `- Source path: \`${audit.source.path}\``,
    `- Expected SHA-256: \`${audit.source.expectedSha256}\``,
    `- Actual SHA-256: \`${audit.source.actualSha256}\``,
    `- Expected line count: ${audit.source.expectedLineCount}`,
    `- Actual line count: ${audit.source.actualLineCount}`,
    `- Exact source verified: ${audit.source.verified}`,
    `- Unaccounted source lines: ${audit.source.unaccountedLines.length}`,
    "",
    "## Completion Semantics",
    "",
    `- Disposition complete: ${audit.dispositionComplete}`,
    `- Local implementation complete: ${audit.localImplementationComplete}`,
    `- Production evidence complete: ${audit.productionEvidenceComplete}`,
    "",
    "Disposition complete means every source facet has an evidence-backed classification. It does not mean every requirement is implemented or externally verified.",
    "",
    "## Status Counts",
    ""
  ];

  for (const [status, count] of Object.entries(audit.summary.statusCounts).sort()) {
    lines.push(`- \`${status}\`: ${count}`);
  }

  lines.push("", "## Atomic Requirements", "");

  for (const requirement of manifest.requirements) {
    lines.push(
      `### ${requirement.id}`,
      "",
      `- Category: \`${requirement.category}\``,
      `- Status: \`${requirement.status}\``,
      `- Source lines: ${formatSourceRanges(requirement.sourceLines)}`,
      `- Requirement: ${requirement.requirement}`
    );

    if (requirement.blocker) {
      lines.push(`- External blocker: ${requirement.blocker}`);
    }

    if (requirement.prohibitionReason) {
      lines.push(`- Prohibition rationale: ${requirement.prohibitionReason}`);
    }

    lines.push("- Evidence:");
    for (const evidence of requirement.evidence) {
      lines.push(`  - \`${evidence.kind}\` \`${evidence.path}\`: ${evidence.claim}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  ACCEPTED_STATUSES,
  DEFAULT_MANIFEST_PATH,
  auditProfessionalBettingFactory,
  loadProfessionalBettingRequirements,
  renderProfessionalBettingFactoryMarkdown
};
