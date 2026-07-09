#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const { evaluateLiveTicketAndLog } = require("../live/evaluate-live-ticket.js");
const { fetchJson } = require("../live/fixture-fetch.js");
const { LiveTicketValidationError, validateLiveTicket } = require("../validate-live-ticket.js");

function printUsage() {
  console.error(
    "Usage: npm run watch:live -- <ticket.json> [--interval-seconds <n>] [--iterations <n>] [--log-path <path>]"
  );
}

function parseArgs(argv) {
  const args = [...argv];
  let inputPath = null;
  let intervalSeconds = 60;
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
      fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : undefined
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
