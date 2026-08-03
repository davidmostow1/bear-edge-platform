#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  getReleaseReadiness,
  renderReleaseReadinessMarkdown
} = require("../src/release-readiness.js");
const { loadEnvFiles } = require("../src/config/env.js");
const { createOperatorAuth } = require("../src/config/operator-auth.js");

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const outDir = path.join(rootDir, "data", "reports");
  loadEnvFiles({ rootDir });
  const operatorAuth = createOperatorAuth({
    requireToken: true,
    token: process.env.BEAR_EDGE_OPERATOR_TOKEN
  });
  const report = await getReleaseReadiness({
    rootDir,
    operatorAuthStatus: operatorAuth.getStatus()
  });
  const jsonPath = path.join(outDir, "release_readiness.json");
  const markdownPath = path.join(outDir, "release_readiness.md");

  await fs.mkdir(outDir, { recursive: true });
  await Promise.all([
    fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    fs.writeFile(markdownPath, renderReleaseReadinessMarkdown(report), "utf8")
  ]);

  console.log(`Release readiness: ${report.status} (${report.summary.score}/100)`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${markdownPath}`);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
