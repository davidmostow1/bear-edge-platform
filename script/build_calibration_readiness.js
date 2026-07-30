#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  readAuthoritativeLedger,
  resolveAuthoritativeLedgerPath
} = require("../src/audit/authoritative-ledger.js");
const { canonicalStringify } = require("../src/audit/canonical-json.js");
const {
  buildCalibrationReadiness,
  projectCalibrationLedger,
  renderCalibrationReadinessMarkdown
} = require("../src/calibration/ledger-projection.js");

const DEFAULTS = Object.freeze({
  ledger: resolveAuthoritativeLedgerPath(),
  json: path.resolve(process.cwd(), "data/reports/calibration_readiness.json"),
  jsonl: path.resolve(process.cwd(), "data/calibration/calibration_dataset.jsonl"),
  markdown: path.resolve(process.cwd(), "data/reports/calibration_readiness.md")
});
const FLAG_TO_KEY = Object.freeze({
  "--ledger": "ledger",
  "--json": "json",
  "--jsonl": "jsonl",
  "--markdown": "markdown"
});

function parseFlags(argv) {
  if (argv.length % 2 !== 0) {
    throw new TypeError("Calibration readiness flags require a value.");
  }
  const values = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const key = FLAG_TO_KEY[flag];
    const value = argv[index + 1];
    if (!key) {
      throw new TypeError(`Unsupported flag: ${String(flag)}`);
    }
    if (typeof value !== "string" || !value.trim() || value.startsWith("--")) {
      throw new TypeError(`Flag ${flag} requires a nonblank value.`);
    }
    values[key] = path.resolve(value);
  }
  return values;
}

async function writeFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, "utf8");
}

async function main(argv = process.argv.slice(2)) {
  const paths = parseFlags(argv);
  const inspection = await readAuthoritativeLedger({ ledgerPath: paths.ledger });
  const projection = projectCalibrationLedger(inspection.records);
  const readiness = buildCalibrationReadiness(projection);
  const report = {
    generatedAt: new Date().toISOString(),
    ledgerPath: inspection.ledgerPath,
    ledgerIntegrity: {
      malformedLines: inspection.malformedLines,
      duplicateIds: inspection.duplicateIds,
      digestConflicts: inspection.digestConflicts,
      invalidRecords: inspection.invalidRecords
    },
    readiness,
    projection
  };
  const jsonLines = projection.rows.length === 0
    ? ""
    : `${projection.rows.map((row) => canonicalStringify(row)).join("\n")}\n`;

  await writeFile(paths.json, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(paths.jsonl, jsonLines);
  await writeFile(paths.markdown, renderCalibrationReadinessMarkdown(report));

  process.stdout.write(
    `Calibration readiness: ${readiness.status}; eligible ${projection.rows.length}; settled ${projection.summary.settledPredictionCount}\n`
  );
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  parseFlags
};
