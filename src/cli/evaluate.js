#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  BetInputValidationError,
  appendAuthoritativeRecord,
  createStraightEvaluationAuditRecord,
  evaluateBetDecision,
  validateBetInput
} = require("../index.js");

function printUsage() {
  console.error(
    [
      "Usage: npm run evaluate -- <bet.json> [--log-path <path>] [--compact]",
      "       npm run evaluate -- --stdin [--log-path <path>] [--compact]",
      "       npm run evaluate -- --schema"
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  let inputPath = null;
  let logPath;
  let readFromStdin = false;
  let compact = false;
  let printSchema = false;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === "--help" || value === "-h") {
      return { help: true };
    }

    if (value === "--log-path") {
      const nextValue = args[index + 1];

      if (!nextValue) {
        throw new Error("Missing value for --log-path.");
      }

      logPath = nextValue;
      index += 1;
      continue;
    }

    if (value === "--stdin") {
      readFromStdin = true;
      continue;
    }

    if (value === "--compact") {
      compact = true;
      continue;
    }

    if (value === "--schema") {
      printSchema = true;
      continue;
    }

    if (inputPath === null) {
      inputPath = value;
      continue;
    }

    throw new Error(`Unexpected argument: ${value}`);
  }

  if (!inputPath) {
    if (readFromStdin || printSchema) {
      return {
        help: false,
        inputPath,
        logPath,
        readFromStdin,
        compact,
        printSchema
      };
    }

    throw new Error("Missing input JSON path.");
  }

  return {
    help: false,
    inputPath,
    logPath,
    readFromStdin,
    compact,
    printSchema
  };
}

function formatValidationError(error) {
  return [
    error.message,
    ...error.issues.map((issue) => `- ${issue.path || "<root>"}: ${issue.message}`)
  ].join("\n");
}

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function main(argv = process.argv.slice(2)) {
  let parsedArgs;

  try {
    parsedArgs = parseArgs(argv);
  } catch (error) {
    printUsage();
    throw error;
  }

  if (parsedArgs.help) {
    printUsage();
    return 0;
  }

  if (parsedArgs.printSchema) {
    process.stdout.write(`${JSON.stringify(require("../index.js").BET_INPUT_SCHEMA, null, parsedArgs.compact ? 0 : 2)}\n`);
    return 0;
  }

  const absoluteInputPath = parsedArgs.readFromStdin ? null : path.resolve(parsedArgs.inputPath);
  const fileContents = parsedArgs.readFromStdin ? await readStdin() : await fs.readFile(absoluteInputPath, "utf8");
  const rawInput = JSON.parse(fileContents);
  const validatedInput = validateBetInput(rawInput);
  const result = evaluateBetDecision(validatedInput);
  const auditRecord = createStraightEvaluationAuditRecord(validatedInput, result, {
    origin: {
      channel: "cli",
      actorType: "operator",
      sessionId: null,
      requestId: null
    },
    sourceLocator: absoluteInputPath ?? "stdin"
  });
  const persistence = await appendAuthoritativeRecord(auditRecord, {
    logPath: parsedArgs.logPath
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ...result,
        verdict: auditRecord.verdict,
        reasons: auditRecord.reasons,
        riskFlags: auditRecord.riskFlags,
        decisionLog: auditRecord,
        recordId: auditRecord.id,
        clientEventId: auditRecord.clientEventId,
        contentDigest: auditRecord.contentDigest,
        persistedAt: persistence.persistedAt,
        inputPath: absoluteInputPath,
        logPath: persistence.ledgerPath,
        ledgerPath: persistence.ledgerPath
      },
      null,
      parsedArgs.compact ? 0 : 2
    )}\n`
  );

  return 0;
}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof BetInputValidationError) {
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
