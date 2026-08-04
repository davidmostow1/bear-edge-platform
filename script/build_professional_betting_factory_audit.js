#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  auditProfessionalBettingFactory,
  loadProfessionalBettingRequirements,
  renderProfessionalBettingFactoryMarkdown
} = require("../src/audit/professional-betting-factory.js");

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const manifest = await loadProfessionalBettingRequirements({ rootDir });
  const sourcePath = path.resolve(process.env.BEAR_EDGE_FACTORY_SOURCE_PATH ?? manifest.source.pathHint);
  const audit = await auditProfessionalBettingFactory({ rootDir, sourcePath, manifest });
  const report = {
    ...audit,
    requirements: manifest.requirements
  };
  const outputDirectory = path.join(rootDir, "data", "reports");
  const jsonPath = path.join(outputDirectory, "professional_betting_factory.json");
  const markdownPath = path.join(outputDirectory, "professional_betting_factory.md");

  await fs.mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    fs.writeFile(markdownPath, renderProfessionalBettingFactoryMarkdown(manifest, audit), "utf8")
  ]);

  process.stdout.write(`${JSON.stringify({
    jsonPath,
    markdownPath,
    requirementCount: audit.summary.requirementCount,
    statusCounts: audit.summary.statusCounts,
    dispositionComplete: audit.dispositionComplete,
    localImplementationComplete: audit.localImplementationComplete,
    productionEvidenceComplete: audit.productionEvidenceComplete
  }, null, 2)}\n`);

  if (!audit.dispositionComplete) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
