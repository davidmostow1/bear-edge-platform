#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  evaluateEsportsCandidateAndLog,
  loadEsportsSourceRegistry
} = require("../esports/index.js");
const { buildEsportsSeriesProjection } = require("../esports/series-projection.js");
const { buildDotaSeriesProjection } = require("../esports/dota-series-projection.js");

const GENERATED_PROJECTION_FIELDS = Object.freeze([
  "independentModelId",
  "independentModelVersion",
  "independentImplementationDigest",
  "featureSnapshotDigest",
  "eventId",
  "marketFamily",
  "selection",
  "side",
  "generatedAt",
  "pointProbability",
  "lowerProbability",
  "upperProbability",
  "predictionArtifactLocator",
  "verificationStatus",
  "predictionDigest"
]);

function prepareCandidateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Candidate input must be an object.");
  }
  if (input.projectionInput === undefined) return input;
  if (!input.model || typeof input.model !== "object" || Array.isArray(input.model)) {
    throw new TypeError("Candidate model registry identity is required.");
  }
  const conflicting = GENERATED_PROJECTION_FIELDS.filter(
    (field) => Object.hasOwn(input.model, field) && input.model[field] !== null
  );
  if (conflicting.length > 0) {
    throw new Error(`Generated projection conflicts with caller-supplied model fields: ${conflicting.join(", ")}.`);
  }
  const generatedProjection = input.projectionInput?.schemaVersion
    === "bear-edge.dota-series-projection-input.v1"
    ? buildDotaSeriesProjection(input.projectionInput)
    : buildEsportsSeriesProjection(input.game, input.projectionInput);
  const prepared = structuredClone(input);
  delete prepared.projectionInput;
  prepared.model = { ...prepared.model, ...generatedProjection };
  delete prepared.model.schemaVersion;
  return prepared;
}

function printUsage() {
  console.error([
    "Usage: npm run evaluate:esports -- <candidate.json> [--ledger-path <path>] [--source-registry <path>] [--compact]",
    "       npm run evaluate:esports -- --stdin [--ledger-path <path>] [--source-registry <path>] [--compact]",
    "       npm run evaluate:esports -- <candidate.json> --as-of <ISO-UTC> [--compact]  # non-actionable replay",
    "",
    "Every result, including PASS, LEAN, and WAIT, is appended to the authoritative ledger."
  ].join("\n"));
}

function parseArgs(argv) {
  const parsed = {
    compact: false,
    help: false,
    inputPath: null,
    ledgerPath: undefined,
    asOf: undefined,
    readFromStdin: false,
    sourceRegistryPath: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--help" || value === "-h") {
      parsed.help = true;
      continue;
    }
    if (value === "--stdin") {
      parsed.readFromStdin = true;
      continue;
    }
    if (value === "--compact") {
      parsed.compact = true;
      continue;
    }
    if (["--ledger-path", "--source-registry", "--as-of"].includes(value)) {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error(`Missing value for ${value}.`);
      }
      if (value === "--ledger-path") {
        parsed.ledgerPath = nextValue;
      } else if (value === "--source-registry") {
        parsed.sourceRegistryPath = nextValue;
      } else {
        parsed.asOf = nextValue;
      }
      index += 1;
      continue;
    }
    if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    }
    if (parsed.inputPath !== null) {
      throw new Error(`Unexpected argument: ${value}`);
    }
    parsed.inputPath = value;
  }

  if (!parsed.help && !parsed.readFromStdin && !parsed.inputPath) {
    throw new Error("Missing candidate JSON path or --stdin.");
  }
  if (parsed.readFromStdin && parsed.inputPath) {
    throw new Error("Use either a candidate JSON path or --stdin, not both.");
  }

  return parsed;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    printUsage();
    throw error;
  }

  if (parsed.help) {
    printUsage();
    return 0;
  }

  const absoluteInputPath = parsed.readFromStdin
    ? null
    : path.resolve(parsed.inputPath);
  const contents = parsed.readFromStdin
    ? await readStdin()
    : await fs.readFile(absoluteInputPath, "utf8");
  const input = prepareCandidateInput(JSON.parse(contents));
  const sourceRegistry = loadEsportsSourceRegistry(parsed.sourceRegistryPath);
  const result = await evaluateEsportsCandidateAndLog(input, {
    ledgerPath: parsed.ledgerPath,
    ...(parsed.asOf ? { mode: "replay", now: parsed.asOf } : {}),
    origin: {
      channel: "cli",
      actorType: "operator",
      sessionId: null,
      requestId: null
    },
    sourceRegistry
  });

  process.stdout.write(`${JSON.stringify({
    ...result,
    inputPath: absoluteInputPath,
    ledgerPath: result.persistence.ledgerPath
  }, null, parsed.compact ? 0 : 2)}\n`);

  return 0;
}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof SyntaxError) {
      console.error(`Invalid JSON: ${error.message}`);
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  parseArgs,
  prepareCandidateInput
};
