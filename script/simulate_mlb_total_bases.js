#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  EXECUTION_BOOK,
  evaluateTotalBasesCandidate
} = require("../src/mlb/total-bases-market.js");

function parseArgs(argv) {
  const args = { input: null, output: null };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === "--input") {
      args.input = value;
      index += 1;
    } else if (arg === "--output") {
      args.output = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.input) {
    throw new Error("--input is required.");
  }
  if (!args.output) {
    throw new Error("--output is required.");
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);
  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  if (!Array.isArray(payload.candidates) || payload.candidates.length === 0) {
    throw new Error("Input must contain a non-empty candidates array.");
  }

  const results = payload.candidates.map((candidate) => evaluateTotalBasesCandidate(candidate));
  const output = {
    schemaVersion: "1.0.0",
    mode: "shadow",
    authorization: "PRICE_CHECK_ONLY",
    executionBook: EXECUTION_BOOK,
    slateDate: payload.slateDate ?? null,
    sourceGeneratedAt: payload.generatedAt ?? null,
    results
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output: outputPath, candidates: results.length, mode: output.mode })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
