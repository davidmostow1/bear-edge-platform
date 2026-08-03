#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { ingestStrikeoutProps } = require("../showdown/ingest-props.js");
const { SnapshotStore } = require("../showdown/snapshot-store.js");
const {
  CreditBudget,
  DEFAULT_MONTHLY_CAP,
  billingPeriod
} = require("../showdown/credit-budget.js");

function printUsage() {
  console.error(
    [
      "Usage: npm run ingest:props -- --output <market-baseline.jsonl> [options]",
      "",
      "Options:",
      "  --output <path>        Where to append market_baseline records (required)",
      "  --games <n>            Maximum games to price this run (default 5)",
      "  --monthly-cap <n>      Hard credit ceiling for the month (default " + DEFAULT_MONTHLY_CAP + ")",
      "  --evidence-cutoff <iso>  Evidence cutoff to stamp on records",
      "  --dry-run              Walk the whole path and spend zero credits",
      "  --budget               Print remaining credits and exit",
      "",
      "Cost model: the slate call is free. Each game priced costs 1 credit",
      "(1 market x 1 region). Empty responses are not charged. Anything already",
      "captured in the snapshot store is re-read from disk for free."
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    output: null,
    games: 5,
    monthlyCap: null,
    evidenceCutoff: null,
    dryRun: false,
    budgetOnly: false,
    help: false
  };

  const requireValue = (flag, value) => {
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];

    switch (flag) {
      case "--output":
        options.output = requireValue(flag, args[index += 1]);
        break;
      case "--games":
        options.games = Number(requireValue(flag, args[index += 1]));
        break;
      case "--monthly-cap":
        options.monthlyCap = Number(requireValue(flag, args[index += 1]));
        break;
      case "--evidence-cutoff":
        options.evidenceCutoff = requireValue(flag, args[index += 1]);
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--budget":
        options.budgetOnly = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return options;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Odds API responded ${response.status}. `
      + `Remaining credits: ${response.headers.get("x-requests-remaining") ?? "unknown"}`
    );
  }

  const remaining = Number(response.headers.get("x-requests-remaining"));
  const data = await response.json();

  return { data, remaining: Number.isFinite(remaining) ? remaining : null };
}

async function main(argv) {
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

  const budget = new CreditBudget(
    Number.isFinite(options.monthlyCap) && options.monthlyCap !== null
      ? { monthlyCap: options.monthlyCap }
      : {}
  );

  if (options.budgetOnly) {
    const store = new SnapshotStore();
    console.log(`Billing period:  ${billingPeriod()}`);
    console.log(`Credit cap:      ${budget.monthlyCap}`);
    console.log(`Spent so far:    ${budget.spentInPeriod()}`);
    console.log(`Remaining:       ${budget.remaining()}`);
    console.log("");
    console.log("Snapshot store:");
    const summary = store.summarize();

    if (summary.length === 0) {
      console.log("  (empty — nothing captured yet)");
    } else {
      summary.forEach((entry) => {
        console.log(
          `  ${entry.provider}: ${entry.captures} capture(s), `
          + `${entry.creditsSpent} credit(s) of permanently stored data`
        );
      });
    }

    return 0;
  }

  if (!options.output) {
    console.error("Missing required flag: --output");
    printUsage();
    return 2;
  }

  const apiKey = process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY;

  if (!apiKey) {
    console.error(
      "No THE_ODDS_API_KEY or ODDS_API_KEY is set. Load .env.local before running."
    );
    return 2;
  }

  const result = await ingestStrikeoutProps({
    apiKey,
    fetchJsonImpl: fetchJson,
    budget,
    maxGames: options.games,
    dryRun: options.dryRun,
    evidenceCutoffAt: options.evidenceCutoff ?? undefined
  });

  if (result.records.length > 0 && !options.dryRun) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.appendFileSync(
      options.output,
      result.records.map((record) => JSON.stringify(record)).join("\n") + "\n",
      "utf8"
    );
  }

  console.log(`Slate size:          ${result.slateSize} upcoming game(s) (free call)`);
  console.log(`Games considered:    ${result.eventsConsidered}`);
  console.log(`Credits spent:       ${result.creditsSpent}`);
  console.log(`Served from disk:    ${result.cacheHits}`);
  console.log(`Credits remaining:   ${result.creditsRemaining} of ${budget.monthlyCap}`);
  console.log(`Baseline records:    ${result.records.length}`);

  if (result.skipped.length > 0) {
    console.log(`Skipped:             ${result.skipped.length}`);
    result.skipped.slice(0, 10).forEach((entry) => {
      console.log(`  ${entry.eventId}: ${entry.reason}`);
    });
  }

  if (options.dryRun) {
    console.log("");
    console.log("Dry run — no credits were spent and nothing was written.");
  } else if (result.records.length > 0) {
    console.log(`\nAppended ${result.records.length} record(s) to ${options.output}`);
  }

  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

module.exports = { main, parseArgs };
