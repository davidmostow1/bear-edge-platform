#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  resolveAuthoritativeLedgerPath
} = require("../audit/authoritative-ledger.js");
const {
  canonicalStringify,
  contentDigest
} = require("../audit/canonical-json.js");
const {
  captureShadowCohort,
  createShadowCohortArtifact
} = require("../audit/shadow-cohort.js");

const DEFAULT_ARTIFACT_DIR = "data/evidence/shadow-cohorts";
const SHADOW_CAPTURE_CODE_VERSION = "1.0.0";

function printUsage(write = console.error) {
  write([
    "Usage:",
    "  npm run shadow:capture -- --input <candidate-payload.json> [options]",
    "",
    "Purpose:",
    "  Freeze every returned MLB research candidate as a side-normalized,",
    "  prestart WAIT record. No odds, edge, stake, pick, or BET is created.",
    "",
    "Options:",
    "  --input <path>          Use an existing local candidate payload or retained artifact",
    "  --artifact-dir <path>   Retained sanitized artifacts (default data/evidence/shadow-cohorts)",
    "  --ledger <path>         Authoritative decision ledger",
    "  --outbox <path>         Optional synchronization outbox",
    "  --dry-run               Validate and summarize without writing",
    "  --help                  Show this help",
    "",
    "Important:",
    "  This command performs no network requests, schedules no polling, and enters no credentials.",
    "  Supply data obtained manually, from a licensed source, or from an openly reusable source."
  ].join("\n"));
}

function requiredValue(args, index, flag) {
  const value = args[index + 1];

  if (typeof value !== "string" || !value.trim() || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    input: null,
    artifactDir: DEFAULT_ARTIFACT_DIR,
    ledgerPath: null,
    outboxPath: null,
    dryRun: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];

    switch (flag) {
      case "--input":
        options.input = requiredValue(args, index, flag);
        index += 1;
        break;
      case "--artifact-dir":
        options.artifactDir = requiredValue(args, index, flag);
        index += 1;
        break;
      case "--ledger":
        options.ledgerPath = requiredValue(args, index, flag);
        index += 1;
        break;
      case "--outbox":
        options.outboxPath = requiredValue(args, index, flag);
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}.`);
    }
  }

  if (!options.help && !options.input) {
    throw new Error("--input is required.");
  }

  return options;
}

async function readJsonFile(filePath, fsImpl = fs) {
  const resolved = path.resolve(filePath);
  const raw = await fsImpl.readFile(resolved, "utf8");

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Input file is not valid JSON: ${resolved}`, { cause: error });
  }
}

async function retainArtifact(artifact, options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const artifactDigest = contentDigest(artifact);
  const directory = path.resolve(options.artifactDir ?? DEFAULT_ARTIFACT_DIR);
  const artifactLocator = path.join(directory, `${artifactDigest}.json`);
  const contents = canonicalStringify(artifact);

  await fsImpl.mkdir(directory, { recursive: true });

  try {
    await fsImpl.writeFile(artifactLocator, contents, {
      encoding: "utf8",
      flag: "wx"
    });
    return {
      artifactDigest,
      artifactLocator,
      retained: true,
      existing: false
    };
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }

  const existing = await fsImpl.readFile(artifactLocator, "utf8");

  if (existing !== contents) {
    throw new Error(
      `Artifact digest collision or retained-file corruption at ${artifactLocator}.`
    );
  }

  return {
    artifactDigest,
    artifactLocator,
    retained: true,
    existing: true
  };
}

function plannedArtifact(artifact, artifactDir) {
  const artifactDigest = contentDigest(artifact);
  const artifactLocator = path.join(
    path.resolve(artifactDir ?? DEFAULT_ARTIFACT_DIR),
    `${artifactDigest}.json`
  );

  return {
    artifactDigest,
    artifactLocator,
    retained: false,
    existing: false
  };
}

function safeMissingness(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    gameId: entry?.gameId ?? null,
    playerId: entry?.playerId ?? null,
    statKey: entry?.statKey ?? null,
    reason: entry?.reason ?? "Unspecified generator omission."
  }));
}

function publicSummary(capture, retained, ledgerPath) {
  const missingness = safeMissingness(capture.generationMissingness);
  const noEligibleEvents = capture.coverage.eligibleEventIds.length === 0;
  const incomplete = (
    noEligibleEvents
    || capture.coverage.allEligibleEventsRepresented !== true
    || missingness.length > 0
  );

  return {
    status: noEligibleEvents
      ? (capture.dryRun ? "dry_run_no_eligible_events" : "no_eligible_events")
      : capture.dryRun
        ? (incomplete ? "dry_run_incomplete" : "dry_run_complete")
        : (incomplete ? "captured_with_missingness" : "captured"),
    researchOnly: true,
    betAuthorization: false,
    sportsbookPricesIncluded: false,
    stakesIncluded: false,
    artifact: {
      digest: retained.artifactDigest,
      locator: retained.artifactLocator,
      retained: retained.retained,
      alreadyExisted: retained.existing
    },
    ledgerPath: capture.dryRun ? null : ledgerPath,
    candidateRecords: capture.candidates,
    appended: capture.appended,
    existing: capture.existing,
    eligibleEvents: capture.coverage.eligibleEventIds.length,
    representedEvents: capture.coverage.representedEventIds.length,
    missingEventIds: capture.coverage.missingEventIds,
    generatorMissingness: missingness,
    syncFailures: Array.isArray(capture.syncFailures) ? capture.syncFailures : []
  };
}

async function loadArtifact(options, dependencies) {
  const input = await readJsonFile(options.input, dependencies.fsImpl);
  const payload = input?.artifactType
    ? {
        fetchedAt: input.capturedAt,
        gameWindow: input.gameWindow,
        candidates: input.candidates,
        skipped: input.generationMissingness
      }
    : input;

  return createShadowCohortArtifact(payload);
}

async function main(argv, dependencies = {}) {
  const writeError = dependencies.writeError ?? console.error;
  const writeOutput = dependencies.writeOutput ?? console.log;
  let options;

  try {
    options = parseArgs(argv);
  } catch (error) {
    writeError(error.message);
    printUsage(writeError);
    return 2;
  }

  if (options.help) {
    printUsage(writeOutput);
    return 0;
  }

  try {
    const artifact = await loadArtifact(options, dependencies);
    const retained = options.dryRun
      ? plannedArtifact(artifact, options.artifactDir)
      : await retainArtifact(artifact, {
          artifactDir: options.artifactDir,
          fsImpl: dependencies.fsImpl
        });
    const ledgerPath = resolveAuthoritativeLedgerPath(options.ledgerPath);
    const capture = await captureShadowCohort(artifact, {
      artifactDigest: retained.artifactDigest,
      artifactLocator: retained.artifactLocator,
      codeVersion: SHADOW_CAPTURE_CODE_VERSION,
      ledgerPath,
      outboxPath: options.outboxPath,
      dryRun: options.dryRun,
      fsImpl: dependencies.fsImpl,
      outboxFsImpl: dependencies.outboxFsImpl,
      appendRecordImpl: dependencies.appendRecordImpl
    });
    const summary = publicSummary(capture, retained, ledgerPath);

    writeOutput(JSON.stringify(summary, null, 2));

    if (summary.syncFailures.length > 0) {
      return 4;
    }
    if (
      summary.eligibleEvents === 0
      || summary.missingEventIds.length > 0
      || summary.generatorMissingness.length > 0
    ) {
      return 3;
    }

    return 0;
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
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

module.exports = {
  loadArtifact,
  main,
  parseArgs,
  plannedArtifact,
  publicSummary,
  readJsonFile,
  retainArtifact
};
