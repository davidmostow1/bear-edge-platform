#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const { isBearEdgeTestModeEnabled } = require("../config/runtime-flags.js");
const { evaluateLiveTicketAndLog } = require("../live/evaluate-live-ticket.js");
const { fetchJson } = require("../live/fixture-fetch.js");
const { LiveTicketValidationError, validateLiveTicket } = require("../validate-live-ticket.js");

function printUsage() {
  console.error(
    "Usage: npm run watch:live -- <ticket.json> [--interval-seconds <n>] [--iterations <n>] [--log-path <path>]"
  );
}

// The paid odds response cache has a two minute TTL. A poll interval shorter
// than that out-runs its own cache and buys the same prices repeatedly, which
// is the fastest way to burn a monthly credit allowance without noticing.
// Default to just past the TTL; --interval-seconds can still go lower
// deliberately.
const DEFAULT_INTERVAL_SECONDS = 150;

function parseArgs(argv) {
  const args = [...argv];
  let inputPath = null;
  let intervalSeconds = DEFAULT_INTERVAL_SECONDS;
  let iterations = Infinity;
  let logPath;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--interval-seconds") {
      intervalSeconds = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--iterations") {
      iterations = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--log-path") {
      logPath = args[index + 1];
      index += 1;
      continue;
    }

    if (!inputPath) {
      inputPath = value;
      continue;
    }

    throw new Error(`Unexpected argument: ${value}`);
  }

  if (!inputPath) {
    throw new Error("Missing ticket JSON path.");
  }

  return {
    inputPath,
    intervalSeconds,
    iterations,
    logPath
  };
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(argv = process.argv.slice(2)) {
  let parsedArgs;

  try {
    parsedArgs = parseArgs(argv);
  } catch (error) {
    printUsage();
    throw error;
  }

  for (let iteration = 0; iteration < parsedArgs.iterations; iteration += 1) {
    const absoluteInputPath = path.resolve(parsedArgs.inputPath);
    const rawInput = JSON.parse(await fs.readFile(absoluteInputPath, "utf8"));
    const ticket = validateLiveTicket(rawInput);
    const result = await evaluateLiveTicketAndLog(ticket, {
      logPath: parsedArgs.logPath,
      fetchJsonImpl: isBearEdgeTestModeEnabled() ? fetchJson : undefined
    });

    process.stdout.write(`${JSON.stringify(result)}\n`);

    if (iteration + 1 < parsedArgs.iterations) {
      await sleep(parsedArgs.intervalSeconds * 1000);
    }
  }

  return 0;
}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof LiveTicketValidationError) {
      console.error(error.message);
      console.error(error.issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n"));
    } else {
      console.error(error.message);
    }

    process.exitCode = 1;
  });
}

module.exports = {
  main,
  parseArgs
};
