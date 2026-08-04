#!/usr/bin/env node

const {
  auditRepositoryBoundaries
} = require("../governance/system-boundaries.js");
const fs = require("node:fs");
const path = require("node:path");

function main() {
  const result = auditRepositoryBoundaries();
  const expectedRoot = fs.realpathSync(path.resolve(__dirname, ".."));
  if (result.repoRoot !== expectedRoot) {
    const error = new Error("Boundary audit result does not identify this repository root.");
    error.code = "WRONG_AUDIT_TARGET";
    throw error;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  const code = typeof error?.code === "string"
    ? error.code
    : "SYSTEM_BOUNDARY_AUDIT_FAILED";
  const message = error instanceof Error ? error.message : "Unknown boundary-audit failure.";
  process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = 1;
}
