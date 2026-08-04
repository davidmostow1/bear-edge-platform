#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const {
  SHARED_MARKET_FAMILIES,
  findDuplicatePredictions,
  parseOutcomeRecord,
  parsePredictionRecord,
  readJsonlLedger
} = require("../showdown/records.js");
const { pairPredictions, summarizeModelMissingness } = require("../showdown/pairing.js");
const {
  DEFAULT_BOOTSTRAP_SAMPLES,
  DEFAULT_BOOTSTRAP_SEED,
  DEFAULT_MIN_DISTINCT_EVENTS,
  DEFAULT_MIN_PAIRED_PREDICTIONS,
  compareModels
} = require("../showdown/compare.js");
const { renderMarkdownReport } = require("../showdown/report.js");

function printUsage() {
  console.error(
    [
      "Usage: npm run compare -- \\",
      "  --sweet <sweet-bear-predictions.jsonl> \\",
      "  --bear <bear-edge-predictions.jsonl> \\",
      "  --outcomes <official-outcomes.jsonl> \\",
      "  --output-dir <reports/YYYY-MM-DD> \\",
      "  [--market <market-baseline-predictions.jsonl>] \\",
      "  [--market-family <family>]... \\",
      "  [--min-paired <n>] [--min-events <n>] \\",
      "  [--bootstrap-samples <n>] [--seed <n>] \\",
      "  [--strict]",
      "",
      "--strict exits non-zero if any ledger line fails validation.",
      "Default scope is the shared head-to-head lane:",
      `  ${SHARED_MARKET_FAMILIES.join(", ")}`
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    sweet: null,
    bear: null,
    outcomes: null,
    market: null,
    outputDir: null,
    marketFamilies: [],
    minPaired: DEFAULT_MIN_PAIRED_PREDICTIONS,
    minEvents: DEFAULT_MIN_DISTINCT_EVENTS,
    bootstrapSamples: DEFAULT_BOOTSTRAP_SAMPLES,
    seed: DEFAULT_BOOTSTRAP_SEED,
    strict: false
  };

  const requireValue = (flag, value) => {
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };

  const requireInteger = (flag, value) => {
    const parsed = Number(requireValue(flag, value));

    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new Error(`${flag} requires a positive integer`);
    }

    return parsed;
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];

    switch (flag) {
      case "--sweet":
        options.sweet = requireValue(flag, args[index += 1]);
        break;
      case "--bear":
        options.bear = requireValue(flag, args[index += 1]);
        break;
      case "--outcomes":
        options.outcomes = requireValue(flag, args[index += 1]);
        break;
      case "--market":
        options.market = requireValue(flag, args[index += 1]);
        break;
      case "--output-dir":
        options.outputDir = requireValue(flag, args[index += 1]);
        break;
      case "--market-family":
        options.marketFamilies.push(requireValue(flag, args[index += 1]));
        break;
      case "--min-paired":
        options.minPaired = requireInteger(flag, args[index += 1]);
        break;
      case "--min-events":
        options.minEvents = requireInteger(flag, args[index += 1]);
        break;
      case "--bootstrap-samples":
        options.bootstrapSamples = requireInteger(flag, args[index += 1]);
        break;
      case "--seed":
        options.seed = requireInteger(flag, args[index += 1]);
        break;
      case "--strict":
        options.strict = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (options.marketFamilies.length === 0) {
    options.marketFamilies = [...SHARED_MARKET_FAMILIES];
  }

  return options;
}

function loadPredictionLedger(filePath, label, rejects) {
  const { records, rejects: parseRejects } = readJsonlLedger(
    filePath,
    parsePredictionRecord
  );

  parseRejects.forEach((reject) => {
    rejects.push({ ledger: label, ...reject });
  });

  return records;
}

function main(argv) {
  let options;

  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    printUsage();
    return 2;
  }

  if (options.help) {
    printUsage();
    return 0;
  }

  const missingFlags = ["sweet", "bear", "outcomes", "outputDir"].filter(
    (key) => !options[key]
  );

  if (missingFlags.length > 0) {
    console.error(`Missing required flags: ${missingFlags.join(", ")}`);
    printUsage();
    return 2;
  }

  const rejects = [];
  const predictions = [
    ...loadPredictionLedger(options.sweet, "sweet", rejects),
    ...loadPredictionLedger(options.bear, "bear", rejects)
  ];

  if (options.market) {
    predictions.push(...loadPredictionLedger(options.market, "market", rejects));
  }

  const { records: outcomes, rejects: outcomeRejects } = readJsonlLedger(
    options.outcomes,
    parseOutcomeRecord
  );

  outcomeRejects.forEach((reject) => {
    rejects.push({ ledger: "outcomes", ...reject });
  });

  findDuplicatePredictions(predictions).forEach((duplicate) => {
    rejects.push({ ledger: "predictions", ...duplicate });
  });

  const { pairs, exclusions, exclusionCounts } = pairPredictions({
    predictions,
    outcomes,
    marketFamilies: options.marketFamilies
  });

  const comparison = compareModels({
    pairs,
    minPairedPredictions: options.minPaired,
    minDistinctEvents: options.minEvents,
    bootstrapSamples: options.bootstrapSamples,
    bootstrapSeed: options.seed
  });

  const generatedAt = new Date().toISOString();
  const context = {
    exclusionCounts,
    missingness: summarizeModelMissingness(predictions),
    generatedAt
  };

  const markdown = renderMarkdownReport(comparison, context);

  fs.mkdirSync(options.outputDir, { recursive: true });
  fs.writeFileSync(path.join(options.outputDir, "showdown.md"), markdown, "utf8");
  fs.writeFileSync(
    path.join(options.outputDir, "showdown.json"),
    `${JSON.stringify(
      {
        generatedAt,
        options: {
          marketFamilies: options.marketFamilies,
          minPaired: options.minPaired,
          minEvents: options.minEvents,
          bootstrapSamples: options.bootstrapSamples,
          seed: options.seed
        },
        comparison,
        exclusionCounts,
        missingness: context.missingness,
        rejects
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(options.outputDir, "exclusions.jsonl"),
    exclusions.map((exclusion) => JSON.stringify(exclusion)).join("\n")
      + (exclusions.length > 0 ? "\n" : ""),
    "utf8"
  );

  process.stdout.write(markdown);

  if (rejects.length > 0) {
    console.error(`\n${rejects.length} ledger line(s) failed validation:`);
    rejects.slice(0, 20).forEach((reject) => {
      console.error(`  [${reject.ledger}:${reject.line}] ${reject.reason}`);
    });

    if (options.strict) {
      return 1;
    }
  }

  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, parseArgs };
