#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const {
  canonicalStringify,
  contentDigest
} = require("../audit/canonical-json.js");
const {
  RETROSHEET_ATTRIBUTION,
  buildRetrosheetBacktest
} = require("../historical/retrosheet-backtest.js");
const {
  verifyRetrosheetZipProvenance
} = require("../historical/zip-provenance.js");

function printUsage(write = console.error) {
  write([
    "Usage:",
    "  npm run backtest:retrosheet -- --season <yyyy> --bundle <season.zip> --gameinfo <csv>",
    "    --batting <csv> --pitching <csv> --output-dir <directory> [options]",
    "",
    "Options:",
    "  --season <yyyy>         One declared season; mixed-season input is rejected",
    "  --players <csv>          Optional allplayers.csv for names",
    "  --source-url <url>       Exact Retrosheet bundle URL",
    "  --min-history <n>        Prior games required per player/model (default 10)",
    "  --recent-limit <n>       Recent-game window (default 10)",
    "  --generated-at <iso>     Reproducible manifest timestamp",
    "  --dry-run                Parse, reconstruct, and summarize without writing",
    "  --help                   Show this help",
    "",
    "This is historical reconstruction only. It never writes to the prospective",
    "decision ledger and cannot authorize bets or satisfy live model-promotion gates."
  ].join("\n"));
}

function requiredValue(args, index, flag) {
  const value = args[index + 1];

  if (typeof value !== "string" || !value.trim() || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function positiveInteger(value, flag) {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1000) {
    throw new Error(`${flag} must be an integer from 1 through 1000.`);
  }

  return parsed;
}

function seasonValue(value, flag) {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1871 || parsed > 9999) {
    throw new Error(`${flag} must be a four-digit season no earlier than 1871.`);
  }

  return parsed;
}

function isoTimestamp(value, flag) {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${flag} must be a valid timestamp.`);
  }

  return new Date(value).toISOString();
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    season: null,
    bundle: null,
    gameinfo: null,
    batting: null,
    pitching: null,
    players: null,
    outputDir: null,
    sourceUrl: "https://www.retrosheet.org/downloads/csvdownloads.html",
    minHistoryGames: 10,
    recentLimit: 10,
    generatedAt: null,
    dryRun: false,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];

    switch (flag) {
      case "--season":
        options.season = seasonValue(requiredValue(args, index, flag), flag);
        index += 1;
        break;
      case "--bundle":
        options.bundle = requiredValue(args, index, flag);
        index += 1;
        break;
      case "--gameinfo":
        options.gameinfo = requiredValue(args, index, flag);
        index += 1;
        break;
      case "--batting":
        options.batting = requiredValue(args, index, flag);
        index += 1;
        break;
      case "--pitching":
        options.pitching = requiredValue(args, index, flag);
        index += 1;
        break;
      case "--players":
        options.players = requiredValue(args, index, flag);
        index += 1;
        break;
      case "--output-dir":
        options.outputDir = requiredValue(args, index, flag);
        index += 1;
        break;
      case "--source-url":
        options.sourceUrl = requiredValue(args, index, flag);
        index += 1;
        break;
      case "--min-history":
        options.minHistoryGames = positiveInteger(
          requiredValue(args, index, flag),
          flag
        );
        index += 1;
        break;
      case "--recent-limit":
        options.recentLimit = positiveInteger(
          requiredValue(args, index, flag),
          flag
        );
        index += 1;
        break;
      case "--generated-at":
        options.generatedAt = isoTimestamp(
          requiredValue(args, index, flag),
          flag
        );
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

  if (!options.help) {
    for (const field of ["season", "bundle", "gameinfo", "batting", "pitching", "outputDir"]) {
      if (!options[field]) {
        throw new Error(`--${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required.`);
      }
    }
  }

  return options;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function loadInputs(options, fsImpl = fs) {
  const [bundle, gameinfo, batting, pitching, players] = await Promise.all([
    fsImpl.readFile(path.resolve(options.bundle)),
    fsImpl.readFile(path.resolve(options.gameinfo)),
    fsImpl.readFile(path.resolve(options.batting)),
    fsImpl.readFile(path.resolve(options.pitching)),
    options.players
      ? fsImpl.readFile(path.resolve(options.players))
      : Promise.resolve(null)
  ]);

  const archiveProvenance = verifyRetrosheetZipProvenance({
    archiveBuffer: bundle,
    gameinfoBuffer: gameinfo,
    battingBuffer: batting,
    pitchingBuffer: pitching,
    playersBuffer: players
  });

  if (archiveProvenance.season !== String(options.season)) {
    throw new Error(
      `ZIP members declare season ${archiveProvenance.season}; expected ${options.season}.`
    );
  }

  return {
    input: {
      gameinfoCsv: gameinfo.toString("utf8"),
      battingCsv: batting.toString("utf8"),
      pitchingCsv: pitching.toString("utf8"),
      allplayersCsv: players ? players.toString("utf8") : null
    },
    sourceDigests: {
      bundle: archiveProvenance.archiveSha256,
      gameinfo: archiveProvenance.members.gameinfo.sha256,
      batting: archiveProvenance.members.batting.sha256,
      pitching: archiveProvenance.members.pitching.sha256,
      allplayers: archiveProvenance.members.players?.sha256 ?? null
    },
    archiveProvenance: {
      status: "verified_archive_member_bytes",
      season: Number(archiveProvenance.season),
      suppliedArchiveDigest: archiveProvenance.archiveSha256,
      members: archiveProvenance.members
    }
  };
}

async function pathExists(filePath, fsImpl = fs) {
  try {
    await fsImpl.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function writeJsonlAtomic(records, outputPath, fsImpl = fs) {
  if (await pathExists(outputPath, fsImpl)) {
    throw new Error(`Refusing to overwrite existing backtest artifact: ${outputPath}`);
  }

  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.tmp`
  );
  const handle = await fsImpl.open(temporaryPath, "wx");
  const hash = crypto.createHash("sha256");
  let pending = "";
  let bytes = 0;
  let failure = null;

  try {
    for (const record of records) {
      const line = `${canonicalStringify(record)}\n`;
      pending += line;
      hash.update(line);
      bytes += Buffer.byteLength(line);

      if (pending.length >= 1024 * 1024) {
        await handle.writeFile(pending, "utf8");
        pending = "";
      }
    }
    if (pending) {
      await handle.writeFile(pending, "utf8");
    }
    await handle.sync();
  } catch (error) {
    failure = error;
  }

  try {
    await handle.close();
  } catch (error) {
    failure ??= error;
  }

  if (!failure) {
    try {
      await fsImpl.link(temporaryPath, outputPath);
    } catch (error) {
      failure = error;
    }
  }

  try {
    await fsImpl.unlink(temporaryPath);
  } catch (error) {
    if (error?.code !== "ENOENT" && !failure) {
      failure = error;
    }
  }

  if (failure) {
    throw failure;
  }

  return {
    outputPath,
    artifactDigest: hash.digest("hex"),
    bytes,
    records: records.length
  };
}

async function writeManifestAtomic(manifest, manifestPath, fsImpl = fs) {
  await fsImpl.writeFile(
    manifestPath,
    `${canonicalStringify(manifest)}\n`,
    { encoding: "utf8", flag: "wx" }
  );
}

function outputNames(result, outputDir) {
  const configurationDigest = contentDigest(result.manifest.configuration).slice(0, 12);
  const bundleDigest = result.manifest.source.sourceDigests.bundle.slice(0, 16);
  const stem = `retrosheet-backtest-${bundleDigest}-${configurationDigest}`;

  return {
    recordsPath: path.join(path.resolve(outputDir), `${stem}.jsonl`),
    manifestPath: path.join(path.resolve(outputDir), `${stem}.manifest.json`)
  };
}

function publicSummary(result, outputs, writeResult = null) {
  return {
    status: writeResult ? "written" : "dry_run",
    mode: "historical_reconstruction",
    season: result.manifest.configuration.season,
    prospective: false,
    promotionEligible: false,
    betAuthorization: false,
    observations: result.manifest.summary.observations,
    distinctEvents: result.manifest.summary.distinctEvents,
    distinctParticipants: result.manifest.summary.distinctParticipants,
    markets: result.manifest.summary.markets,
    insufficientHistory: result.manifest.summary.insufficientHistory,
    excludedRows: result.manifest.summary.excludedRows,
    recordsPath: writeResult ? outputs.recordsPath : null,
    manifestPath: writeResult ? outputs.manifestPath : null,
    artifactDigest: writeResult?.artifactDigest ?? null,
    bytes: writeResult?.bytes ?? null,
    archiveBindingStatus: result.manifest.source.archiveBinding.status,
    attribution: RETROSHEET_ATTRIBUTION
  };
}

async function main(argv, dependencies = {}) {
  const writeError = dependencies.writeError ?? console.error;
  const writeOutput = dependencies.writeOutput ?? console.log;
  const fsImpl = dependencies.fsImpl ?? fs;
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
    const loaded = await loadInputs(options, fsImpl);
    const result = buildRetrosheetBacktest(loaded.input, {
      season: options.season,
      minHistoryGames: options.minHistoryGames,
      recentLimit: options.recentLimit,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      sourceDigests: loaded.sourceDigests,
      archiveProvenance: loaded.archiveProvenance,
      sourceLocator: options.sourceUrl
    });
    const outputs = outputNames(result, options.outputDir);

    if (options.dryRun) {
      writeOutput(JSON.stringify(publicSummary(result, outputs), null, 2));
      return result.records.length > 0 ? 0 : 3;
    }

    await fsImpl.mkdir(path.resolve(options.outputDir), { recursive: true });
    const writeResult = await writeJsonlAtomic(result.records, outputs.recordsPath, fsImpl);
    const manifest = {
      ...result.manifest,
      output: {
        recordsPath: outputs.recordsPath,
        records: writeResult.records,
        bytes: writeResult.bytes,
        artifactDigest: writeResult.artifactDigest
      }
    };

    try {
      await writeManifestAtomic(manifest, outputs.manifestPath, fsImpl);
    } catch (error) {
      throw new Error(
        `Backtest rows were retained at ${outputs.recordsPath}, but manifest creation failed: ${error.message}`,
        { cause: error }
      );
    }

    writeOutput(JSON.stringify(publicSummary(result, outputs, writeResult), null, 2));
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
  loadInputs,
  main,
  outputNames,
  parseArgs,
  publicSummary,
  sha256,
  writeJsonlAtomic,
  writeManifestAtomic
};
