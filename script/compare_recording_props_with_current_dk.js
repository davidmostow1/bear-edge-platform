#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  buildComparisonCsv,
  buildComparisonMarkdown,
  compareRecordingPropsWithCurrentBoard
} = require("../src/live/recording-prop-compare.js");

function printUsage() {
  console.error(
    [
      "Usage: node ./script/compare_recording_props_with_current_dk.js \\",
      "  --recording-csv <path> \\",
      "  --current-board <path> \\",
      "  --out-csv <path> \\",
      "  --out-md <path> \\",
      "  [--bankroll <number>]"
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const parsed = {
    bankroll: 1000
  };

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--recording-csv") {
      parsed.recordingCsvPath = args[index + 1];
      index += 1;
      continue;
    }

    if (value === "--current-board") {
      parsed.currentBoardPath = args[index + 1];
      index += 1;
      continue;
    }

    if (value === "--out-csv") {
      parsed.outCsvPath = args[index + 1];
      index += 1;
      continue;
    }

    if (value === "--out-md") {
      parsed.outMdPath = args[index + 1];
      index += 1;
      continue;
    }

    if (value === "--bankroll") {
      parsed.bankroll = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--help" || value === "-h") {
      parsed.help = true;
      continue;
    }

    throw new Error(`Unexpected argument: ${value}`);
  }

  return parsed;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    printUsage();
    return 0;
  }

  if (
    !args.recordingCsvPath ||
    !args.currentBoardPath ||
    !args.outCsvPath ||
    !args.outMdPath ||
    !Number.isFinite(args.bankroll)
  ) {
    printUsage();
    throw new Error("Missing required arguments.");
  }

  const recordingCsvPath = path.resolve(args.recordingCsvPath);
  const currentBoardPath = path.resolve(args.currentBoardPath);
  const outCsvPath = path.resolve(args.outCsvPath);
  const outMdPath = path.resolve(args.outMdPath);

  const [recordingCsvText, currentBoardText] = await Promise.all([
    fs.readFile(recordingCsvPath, "utf8"),
    fs.readFile(currentBoardPath, "utf8")
  ]);

  const result = await compareRecordingPropsWithCurrentBoard({
    recordingCsvText,
    currentBoardPayload: JSON.parse(currentBoardText),
    bankroll: args.bankroll
  });

  await Promise.all([
    fs.writeFile(outCsvPath, buildComparisonCsv(result)),
    fs.writeFile(
      outMdPath,
      buildComparisonMarkdown(result, {
        recordingCsvPath,
        currentBoardPath
      })
    )
  ]);

  process.stdout.write(
    `${JSON.stringify(
      {
        outCsvPath,
        outMdPath,
        ...result.summary
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
  main,
  parseArgs
};
