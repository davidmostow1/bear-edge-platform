const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const DEFAULT_MANIFEST_PATH = path.join(
  PACKAGE_ROOT,
  "governance",
  "system-boundaries.json"
);
const REQUIRED_LANE_IDS = Object.freeze([
  "bear_edge_core",
  "sweet_bear_draftkings_predictions",
  "sweet_bear_kalshi"
]);
const FIXED_BOUNDARIES = Object.freeze({
  defaultAuthorization: "PRICE_CHECK_ONLY",
  predictiveImprovement: "NOT_EVALUATED",
  modelValidation: "NOT_ESTABLISHED",
  wageringAuthority: "UNCHANGED"
});

class SystemBoundaryError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "SystemBoundaryError";
    this.code = code;
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {boolean} condition
 * @param {string} code
 * @param {string} message
 */
function requireCondition(condition, code, message) {
  if (!condition) {
    throw new SystemBoundaryError(code, message);
  }
}

/**
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string[]}
 */
function requireStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new SystemBoundaryError("INVALID_MANIFEST", `${label} must be an array.`);
  }
  requireCondition(
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0),
    "INVALID_MANIFEST",
    `${label} must contain only non-empty strings.`
  );
  return /** @type {string[]} */ (value);
}

/**
 * @param {Record<string, any>} value
 * @param {string[]} allowedKeys
 * @param {string} label
 */
function requireExactKeys(value, allowedKeys, label) {
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  requireCondition(
    unexpected.length === 0,
    "UNKNOWN_MANIFEST_FIELD",
    `${label} contains unsupported fields: ${unexpected.join(", ")}.`
  );
}

/**
 * @param {string} value
 * @param {string} label
 * @returns {string}
 */
function requireRelativePath(value, label) {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  requireCondition(
    normalized === value
      && !path.posix.isAbsolute(normalized)
      && !/^[a-zA-Z]:\//.test(normalized)
      && normalized !== ".."
      && !normalized.startsWith("../"),
    "UNSAFE_OWNERSHIP_PATH",
    `${label} must be a normalized repository-relative path.`
  );
  return normalized;
}

/**
 * @param {unknown} manifest
 * @returns {Record<string, any>}
 */
function validateBoundaryManifest(manifest) {
  if (!isPlainObject(manifest)) {
    throw new SystemBoundaryError("INVALID_MANIFEST", "Boundary manifest must be an object.");
  }
  requireCondition(
    manifest.schemaVersion === "1.0.0"
      && manifest.policyId === "bear-edge-system-boundaries"
      && manifest.policyVersion === "1.0.0",
    "INVALID_MANIFEST_IDENTITY",
    "Boundary manifest identity or version is unsupported."
  );
  requireExactKeys(manifest, [
    "schemaVersion",
    "policyId",
    "policyVersion",
    "effectiveAt",
    "repositoryPackage",
    "defaultAuthorization",
    "predictiveImprovement",
    "modelValidation",
    "wageringAuthority",
    "lanes",
    "crossLaneRules",
    "bearEdgeProductionProhibitions"
  ], "manifest");
  requireCondition(
    manifest.repositoryPackage === "betting-decision-engine",
    "WRONG_REPOSITORY",
    "Boundary manifest is not for betting-decision-engine."
  );

  for (const [field, expected] of Object.entries(FIXED_BOUNDARIES)) {
    requireCondition(
      manifest[field] === expected,
      "AUTHORIZATION_BOUNDARY_CHANGED",
      `${field} must remain ${expected}.`
    );
  }

  requireCondition(
    Array.isArray(manifest.lanes) && manifest.lanes.length === REQUIRED_LANE_IDS.length,
    "LANE_SET_CHANGED",
    "Boundary manifest must contain exactly three product lanes."
  );

  const laneIds = manifest.lanes.map((lane) => lane?.laneId);
  requireCondition(
    new Set(laneIds).size === REQUIRED_LANE_IDS.length
      && REQUIRED_LANE_IDS.every((laneId) => laneIds.includes(laneId)),
    "LANE_SET_CHANGED",
    "Boundary manifest must contain the canonical Bear Edge, DraftKings Predictions, and Kalshi lane IDs."
  );

  /** @type {Map<string, string>} */
  const pathOwners = new Map();
  /** @type {Map<string, string>} */
  const bankrollOwners = new Map();

  for (const lane of manifest.lanes) {
    requireCondition(isPlainObject(lane), "INVALID_LANE", "Every lane must be an object.");
    requireExactKeys(lane, [
      "laneId",
      "ownership",
      "modelRegistry",
      "ledgerRoots",
      "evidenceRoots",
      "bankrollStorageKeys",
      "mayWriteBearEdge",
      "mayAuthorizeWagers",
      "allowedImportMode"
    ], `${lane.laneId} lane`);
    const ledgerRoots = requireStringArray(lane.ledgerRoots, `${lane.laneId}.ledgerRoots`);
    const evidenceRoots = requireStringArray(lane.evidenceRoots, `${lane.laneId}.evidenceRoots`);
    const bankrollKeys = requireStringArray(
      lane.bankrollStorageKeys,
      `${lane.laneId}.bankrollStorageKeys`
    );
    const ownedPaths = [
      ...(lane.modelRegistry === null
        ? []
        : [requireRelativePath(lane.modelRegistry, `${lane.laneId}.modelRegistry`)]),
      ...ledgerRoots.map((entry) => requireRelativePath(entry, `${lane.laneId}.ledgerRoots`)),
      ...evidenceRoots.map((entry) => requireRelativePath(entry, `${lane.laneId}.evidenceRoots`))
    ];

    for (const ownedPath of ownedPaths) {
      const priorOwner = pathOwners.get(ownedPath);
      requireCondition(
        priorOwner === undefined,
        "CROSS_LANE_PATH_OWNERSHIP",
        `${ownedPath} is owned by both ${priorOwner} and ${lane.laneId}.`
      );
      pathOwners.set(ownedPath, lane.laneId);
    }

    for (const bankrollKey of bankrollKeys) {
      const priorOwner = bankrollOwners.get(bankrollKey);
      requireCondition(
        priorOwner === undefined,
        "CROSS_LANE_BANKROLL_OWNERSHIP",
        `${bankrollKey} is owned by both ${priorOwner} and ${lane.laneId}.`
      );
      bankrollOwners.set(bankrollKey, lane.laneId);
    }

    requireCondition(
      lane.mayAuthorizeWagers === false,
      "WAGER_AUTHORITY_ENABLED",
      `${lane.laneId} must not authorize wagers in Bear Edge.`
    );

    if (lane.laneId === "bear_edge_core") {
      requireCondition(
        lane.ownership === "repository_owner"
          && lane.modelRegistry === "models/registry.json"
          && lane.mayWriteBearEdge === true
          && lane.allowedImportMode === "content_addressed_research_only"
          && bankrollKeys.length === 1
          && bankrollKeys[0] === "bearEdge.bankroll",
        "INVALID_BEAR_EDGE_OWNERSHIP",
        "Bear Edge core ownership does not match the canonical repository boundary."
      );
    } else {
      requireCondition(
        lane.ownership === "external_research_source"
          && lane.modelRegistry === null
          && ledgerRoots.length === 0
          && evidenceRoots.length === 0
          && bankrollKeys.length === 0
          && lane.mayWriteBearEdge === false,
        "EXTERNAL_LANE_OWNS_BEAR_EDGE",
        `${lane.laneId} must not own or write Bear Edge models, ledgers, evidence roots, or bankrolls.`
      );
      const expectedImportMode = lane.laneId === "sweet_bear_draftkings_predictions"
        ? "content_addressed_evidence_only"
        : "content_addressed_research_only";
      requireCondition(
        lane.allowedImportMode === expectedImportMode,
        "INVALID_IMPORT_MODE",
        `${lane.laneId}.allowedImportMode must remain ${expectedImportMode}.`
      );
    }
  }

  const crossLane = manifest.crossLaneRules;
  requireCondition(isPlainObject(crossLane), "INVALID_CROSS_LANE_RULES", "crossLaneRules is required.");
  requireExactKeys(crossLane, [
    "comparisonIsReadOnly",
    "requireSourceLane",
    "requireModelIdentity",
    "requireFeatureCutoff",
    "requireEvidenceDigest",
    "allowLedgerWrites",
    "allowBankrollReads",
    "allowModelPromotion",
    "allowAuthorizationTransfer"
  ], "crossLaneRules");
  for (const requiredTrue of [
    "comparisonIsReadOnly",
    "requireSourceLane",
    "requireModelIdentity",
    "requireFeatureCutoff",
    "requireEvidenceDigest"
  ]) {
    requireCondition(
      crossLane[requiredTrue] === true,
      "CROSS_LANE_GUARD_DISABLED",
      `${requiredTrue} must remain true.`
    );
  }
  for (const requiredFalse of [
    "allowLedgerWrites",
    "allowBankrollReads",
    "allowModelPromotion",
    "allowAuthorizationTransfer"
  ]) {
    requireCondition(
      crossLane[requiredFalse] === false,
      "CROSS_LANE_GUARD_DISABLED",
      `${requiredFalse} must remain false.`
    );
  }

  const prohibitions = manifest.bearEdgeProductionProhibitions;
  requireCondition(
    isPlainObject(prohibitions)
      && prohibitions.allowedDraftKingsPredictionsRole === "evidence_and_price_check_only"
      && prohibitions.allowContractPriceAsSportsbookAmericanOdds === false,
    "MARKET_BOUNDARY_CHANGED",
    "DraftKings Predictions must remain evidence/price-check only and separate from sportsbook odds math."
  );
  requireExactKeys(prohibitions, [
    "sourceTokens",
    "scanRoots",
    "allowedDraftKingsPredictionsRole",
    "allowContractPriceAsSportsbookAmericanOdds"
  ], "bearEdgeProductionProhibitions");
  const sourceTokens = requireStringArray(
    prohibitions.sourceTokens,
    "bearEdgeProductionProhibitions.sourceTokens"
  );
  requireCondition(
    sourceTokens.some((token) => token.toLowerCase() === "kalshi"),
    "PRODUCTION_PROHIBITION_WEAKENED",
    "Bear Edge production source tokens must continue to include Kalshi."
  );
  const scanRoots = requireStringArray(
    prohibitions.scanRoots,
    "bearEdgeProductionProhibitions.scanRoots"
  );
  requireCondition(
    scanRoots.includes("src"),
    "PRODUCTION_PROHIBITION_WEAKENED",
    "Bear Edge production scan roots must continue to include src."
  );
  scanRoots.forEach(
    (entry) => requireRelativePath(entry, "bearEdgeProductionProhibitions.scanRoots")
  );

  return deepFreeze(manifest);
}

/**
 * @param {string} directory
 * @returns {string[]}
 */
function listExecutableSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const resolved = path.join(directory, entry.name);
      requireCondition(
        !entry.isSymbolicLink(),
        "SYMLINKED_SCAN_SURFACE",
        `${resolved} is a symlink inside the production scan surface.`
      );
      if (entry.isDirectory()) {
        return listExecutableSourceFiles(resolved);
      }
      return entry.isFile() && /\.(?:cjs|js|jsx|mjs|ts|tsx)$/i.test(entry.name)
        ? [resolved]
        : [];
    })
    .sort();
}

/**
 * @param {{ repoRoot?: string, manifestPath?: string }} [options]
 * @returns {{
 *   status: "PASS",
 *   repoRoot: string,
 *   manifestPath: string,
 *   manifestDigest: string,
 *   laneIds: string[],
 *   modelCount: number,
 *   researchOnlyModelCount: number,
 *   scannedSourceFiles: number,
 *   bankrollStorageKeys: string[],
 *   authorization: string
 * }}
 */
function auditRepositoryBoundaries(options = {}) {
  const requestedRepoRoot = path.resolve(options.repoRoot ?? PACKAGE_ROOT);
  requireCondition(
    fs.existsSync(requestedRepoRoot) && fs.lstatSync(requestedRepoRoot).isDirectory(),
    "INVALID_REPOSITORY_ROOT",
    "Repository root must be an existing directory."
  );
  const repoRoot = fs.realpathSync(requestedRepoRoot);
  const manifestPath = path.resolve(
    options.manifestPath ?? path.join(repoRoot, "governance", "system-boundaries.json")
  );
  const canonicalManifestPath = path.join(repoRoot, "governance", "system-boundaries.json");
  requireCondition(
    manifestPath === canonicalManifestPath
      && fs.existsSync(manifestPath)
      && !fs.lstatSync(manifestPath).isSymbolicLink(),
    "NONCANONICAL_MANIFEST",
    "Boundary audit must use the repository's canonical non-symlinked manifest."
  );
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = validateBoundaryManifest(JSON.parse(manifestBytes.toString("utf8")));
  const manifestDigest = crypto.createHash("sha256").update(manifestBytes).digest("hex");
  const packageDocument = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
  );
  requireCondition(
    packageDocument.name === manifest.repositoryPackage,
    "WRONG_REPOSITORY",
    "package.json does not match the boundary manifest."
  );

  const registryPath = path.join(repoRoot, "models", "registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const models = Array.isArray(registry.models) ? registry.models : [];
  requireCondition(models.length > 0, "EMPTY_MODEL_REGISTRY", "Model registry must not be empty.");
  requireCondition(
    models.every((model) => model?.modelStatus === "research_only"),
    "MODEL_AUTHORITY_CHANGED",
    "Every Bear Edge model must remain research_only during the bounded repair program."
  );
  const researchOnlyModelCount = models.filter(
    (model) => model?.modelStatus === "research_only"
  ).length;
  requireCondition(
    models.every((model) => {
      const identity = [
        model?.modelId,
        model?.modelVersion,
        model?.marketFamily,
        model?.trainingCutoff,
        model?.calculationImplementation?.implementationDigest,
        model?.calibrationReportDigest,
        ...(Array.isArray(model?.dataSources) ? model.dataSources : []),
        ...(Array.isArray(model?.calculationImplementation?.modules)
          ? model.calculationImplementation.modules
          : [])
      ].join(" ");
      return !/(?:sweet[_ -]?bear|kalshi)/i.test(identity);
    }),
    "CROSS_LANE_MODEL_IDENTITY",
    "Bear Edge registry contains a Sweet Bear or Kalshi model identity."
  );

  const prohibitions = manifest.bearEdgeProductionProhibitions;
  const sourceFiles = prohibitions.scanRoots.flatMap((scanRoot) => {
    const scanPath = path.join(repoRoot, scanRoot);
    requireCondition(
      fs.existsSync(scanPath)
        && fs.lstatSync(scanPath).isDirectory()
        && !fs.lstatSync(scanPath).isSymbolicLink()
        && fs.realpathSync(scanPath).startsWith(`${repoRoot}${path.sep}`),
      "EMPTY_SCAN_SURFACE",
      `${scanRoot} must be an existing, non-symlinked directory inside the repository.`
    );
    return listExecutableSourceFiles(scanPath);
  });
  requireCondition(
    sourceFiles.length > 0,
    "EMPTY_SCAN_SURFACE",
    "Production scan surface must contain executable source files."
  );
  const observedBankrollKeys = new Set();
  for (const sourceFile of sourceFiles) {
    const contents = fs.readFileSync(sourceFile, "utf8");
    for (const token of prohibitions.sourceTokens) {
      requireCondition(
        !contents.toLowerCase().includes(token.toLowerCase()),
        "PROHIBITED_PRODUCTION_INTEGRATION",
        `${path.relative(repoRoot, sourceFile)} contains prohibited production token ${token}.`
      );
    }
    for (const match of contents.matchAll(
      /(["'`])([a-zA-Z][a-zA-Z0-9_-]*\.bankroll[a-zA-Z0-9_]*)\1/g
    )) {
      const lineStart = contents.lastIndexOf("\n", match.index) + 1;
      const lineEnd = contents.indexOf("\n", match.index);
      const sourceLine = contents.slice(
        lineStart,
        lineEnd === -1 ? contents.length : lineEnd
      );
      if (
        match[2] === "stake.bankroll"
        && /(?:validateFinite|requirePositive)\(/.test(sourceLine)
      ) {
        continue;
      }
      observedBankrollKeys.add(match[2]);
    }
  }

  const bearEdgeLane = manifest.lanes.find((lane) => lane.laneId === "bear_edge_core");
  const allowedBankrollKeys = new Set(bearEdgeLane.bankrollStorageKeys);
  requireCondition(
    observedBankrollKeys.has("bearEdge.bankroll")
      && [...observedBankrollKeys].every((key) => allowedBankrollKeys.has(key)),
    "BANKROLL_NAMESPACE_CHANGED",
    "Executable source bankroll storage must remain exclusively namespaced to Bear Edge."
  );

  return {
    status: "PASS",
    repoRoot,
    manifestPath,
    manifestDigest,
    laneIds: manifest.lanes.map((lane) => lane.laneId),
    modelCount: models.length,
    researchOnlyModelCount,
    scannedSourceFiles: sourceFiles.length,
    bankrollStorageKeys: [...observedBankrollKeys].sort(),
    authorization: manifest.defaultAuthorization
  };
}

module.exports = {
  DEFAULT_MANIFEST_PATH,
  FIXED_BOUNDARIES,
  REQUIRED_LANE_IDS,
  SystemBoundaryError,
  auditRepositoryBoundaries,
  validateBoundaryManifest
};
