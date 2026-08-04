#!/usr/bin/env node

const fs = require("node:fs");

const {
  detectLeakage,
  validatePredictionRow
} = require("../src/calibration/dataset.js");
const { buildCalibrationReport } = require("../src/calibration/report.js");

const REQUIRED_FLAGS = Object.freeze([
  "--input",
  "--market-family",
  "--model-id",
  "--model-version",
  "--output"
]);
const FLAG_SET = new Set(REQUIRED_FLAGS);

function parseFlags(argv) {
  const values = {};

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!FLAG_SET.has(flag)) {
      throw new TypeError(`Unsupported flag: ${String(flag)}`);
    }
    if (Object.hasOwn(values, flag)) {
      throw new TypeError(`Flag may be supplied only once: ${flag}`);
    }
    if (typeof value !== "string" || value.trim().length === 0 || value.startsWith("--")) {
      throw new TypeError(`Flag ${flag} requires a nonblank value.`);
    }
    values[flag] = value;
  }

  for (const flag of REQUIRED_FLAGS) {
    if (!Object.hasOwn(values, flag)) {
      throw new TypeError(`Missing required flag: ${flag}`);
    }
  }
  return values;
}

function readJsonLines(inputPath) {
  const source = fs.readFileSync(inputPath, "utf8");
  const rows = [];

  source.split(/\r?\n/).forEach((line, lineIndex) => {
    if (line.trim().length === 0) {
      return;
    }
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new TypeError(
        `Malformed JSONL at line ${lineIndex + 1}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const issues = validatePredictionRow(row);
    if (issues.length > 0) {
      throw new TypeError(
        `Invalid calibration row at line ${lineIndex + 1}: ${issues.map((issue) => issue.code).join(", ")}`
      );
    }
    rows.push(row);
  });

  if (rows.length === 0) {
    throw new TypeError("Calibration input must contain at least one nonblank JSONL row.");
  }
  const findings = detectLeakage(rows);
  if (findings.length > 0) {
    throw new TypeError(
      `Invalid calibration rows contain duplicate observations: ${findings.map((finding) => finding.code).join(", ")}`
    );
  }
  return rows;
}

function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  const rows = readJsonLines(flags["--input"]);
  const report = buildCalibrationReport(rows, {
    marketFamily: flags["--market-family"],
    modelId: flags["--model-id"],
    modelVersion: flags["--model-version"]
  });
  fs.writeFileSync(flags["--output"], `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
  parseFlags,
  readJsonLines
};
