#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const { evaluateLiveTicketAndLog } = require("../live/evaluate-live-ticket.js");
const { fetchJson } = require("../live/fixture-fetch.js");
const { LiveTicketValidationError, validateLiveTicket } = require("../validate-live-ticket.js");

function printUsage() {
  console.error(
    [
      "Usage: npm run evaluate:live -- <ticket.json> [--log-path <path>] [--no-log] [--compact]",
      "       npm run evaluate:live -- --stdin [--log-path <path>] [--no-log] [--compact]"
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  let inputPath = null;
  let logPath;
  let readFromStdin = false;
  let compact = false;
  let writeLog = true;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--stdin") {
      readFromStdin = true;
      continue;
    }

    if (value === "--no-log") {
      writeLog = false;
      continue;
    }

    if (value === "--compact") {
      compact = true;
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

  if (!inputPath && !readFromStdin) {
    throw new Error("Missing ticket JSON path.");
  }

  return {
    inputPath,
    logPath,
    readFromStdin,
    compact,
    writeLog
  };
}

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function formatValidationError(error) {
  return [
    error.message,
    ...error.issues.map((issue) => `- ${issue.path || "<root>"}: ${issue.message}`)
  ].join("\n");
}

async function main(argv = process.argv.slice(2)) {
  let parsedArgs;

  try {
    parsedArgs = parseArgs(argv);
  } catch (error) {
    printUsage();
    throw error;
  }

  const absoluteInputPath = parsedArgs.readFromStdin ? null : path.resolve(parsedArgs.inputPath);
  const fileContents = parsedArgs.readFromStdin ? await readStdin() : await fs.readFile(absoluteInputPath, "utf8");
  const rawInput = JSON.parse(fileContents);
  const ticket = validateLiveTicket(rawInput);
  const result = await evaluateLiveTicketAndLog(ticket, {
    logPath: parsedArgs.logPath,
    writeLog: parsedArgs.writeLog,
    fetchJsonImpl: process.env.BEAR_EDGE_TEST_MODE ? fetchJson : undefined
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ...result,
        inputPath: absoluteInputPath
      },
      null,
      parsedArgs.compact ? 0 : 2
    )}\n`
  );

  return 0;
}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof LiveTicketValidationError) {
      console.error(formatValidationError(error));
    } else if (error instanceof SyntaxError) {
      console.error(`Invalid JSON: ${error.message}`);
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
