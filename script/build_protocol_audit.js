#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  buildAuditReport,
  buildLedger,
  buildLedgerCsv,
  buildMarkdownReport
} = require("../src/audit/protocol-ledger.js");

const DEFAULT_OUTPUT_PATHS = Object.freeze({
  outJsonPath: "data/reports/bear_edge_protocol_audit.json",
  outCsvPath: "data/reports/bear_edge_protocol_audit.csv",
  outMdPath: "data/reports/bear_edge_protocol_audit.md"
});

function printUsage() {
  console.error(
    [
      "Usage: node ./script/build_protocol_audit.js \\",
      "  [--out-json <path>] \\",
      "  [--out-csv <path>] \\",
      "  [--out-md <path>] \\",
      "  [--bankroll <number>]"
    ].join("\n")
  );
}

function parseArgs(argv) {
  const parsed = {
    bankroll: undefined,
    help: false,
    ...DEFAULT_OUTPUT_PATHS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--out-json") {
      parsed.outJsonPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--out-csv") {
      parsed.outCsvPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--out-md") {
      parsed.outMdPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--bankroll") {
      parsed.bankroll = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return parsed;
}

async function writeFileEnsuringDirectory(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    printUsage();
    return 0;
  }

  if (args.bankroll !== undefined && (!Number.isFinite(args.bankroll) || args.bankroll <= 0)) {
    throw new Error("--bankroll must be a positive number when supplied.");
  }

  const ledger = buildLedger(undefined, {
    defaultBankroll: args.bankroll
  });
  const report = buildAuditReport(ledger);
  const outJsonPath = path.resolve(args.outJsonPath);
  const outCsvPath = path.resolve(args.outCsvPath);
  const outMdPath = path.resolve(args.outMdPath);

  await Promise.all([
    writeFileEnsuringDirectory(outJsonPath, `${JSON.stringify(report, null, 2)}\n`),
    writeFileEnsuringDirectory(outCsvPath, buildLedgerCsv(report.ledger)),
    writeFileEnsuringDirectory(outMdPath, buildMarkdownReport(report))
  ]);

  process.stdout.write(
    `${JSON.stringify(
      {
        outJsonPath,
        outCsvPath,
        outMdPath,
        ...report.summary
      },
      null,
      2
    )}\n`
  );

  return 0;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_OUTPUT_PATHS,
  main,
  parseArgs
};
