const fs = require("node:fs");
const path = require("node:path");

const { loadModelRegistry } = require("./model-registry.js");

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_MODEL_ID = "poisson_count_v1";
const DEFAULT_MODEL_VERSION = "1.0.0";
const reportDirectoryCache = new Map();

function normalizedIdentity(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedToken(value) {
  return typeof value === "string"
    ? value.replace(/[^a-z0-9]/gi, "").toLowerCase()
    : "";
}

function resolveMarketFamily({ provider, statGroup, statKey }) {
  if (provider !== "mlb") {
    return null;
  }

  const group = normalizedToken(statGroup);
  const stat = normalizedToken(statKey);

  if (group === "pitching" && ["strikeout", "strikeouts"].includes(stat)) {
    return "pitcher_strikeouts";
  }

  if (group === "hitting" && stat === "hits") {
    return "batter_hits";
  }

  if (group === "hitting" && stat === "runs") {
    return "batter_runs_scored";
  }

  if (group === "hitting" && stat === "totalbases") {
    return "batter_total_bases";
  }

  return null;
}

function readCalibrationReports(reportDirectory) {
  const reportsById = {};
  let entries;

  try {
    entries = fs.readdirSync(reportDirectory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return reportsById;
    }
    throw error;
  }

  const jsonEntries = entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".json")
    .sort((left, right) => left.name.localeCompare(right.name));
  const signature = jsonEntries.map((entry) => {
    const stats = fs.statSync(path.join(reportDirectory, entry.name));
    return [
      entry.name,
      stats.dev,
      stats.ino,
      stats.size,
      stats.mtimeMs,
      stats.ctimeMs
    ].join(":");
  }).join("|");
  const cached = reportDirectoryCache.get(reportDirectory);

  if (cached?.signature === signature) {
    return cached.reportsById;
  }

  for (const entry of jsonEntries) {
    let report;
    try {
      report = JSON.parse(fs.readFileSync(path.join(reportDirectory, entry.name), "utf8"));
    } catch {
      continue;
    }

    const reportId = normalizedIdentity(report?.reportId);
    if (!reportId) {
      continue;
    }
    if (Object.hasOwn(reportsById, reportId)) {
      throw new TypeError(`Duplicate calibration reportId in ${reportDirectory}: ${reportId}`);
    }
    reportsById[reportId] = report;
  }

  reportDirectoryCache.set(reportDirectory, { signature, reportsById });

  return reportsById;
}

function prepareModelRegistryOptions(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? PACKAGE_ROOT);
  const registryPath = path.resolve(options.registryPath ?? path.join(rootDir, "models", "registry.json"));
  const reportDirectory = path.resolve(
    options.reportDirectory ?? path.join(rootDir, "data", "reports")
  );

  return {
    registryPath,
    reportsById: options.reportsById ?? readCalibrationReports(reportDirectory)
  };
}

function registeredModelSummary(model, registry) {
  return {
    modelId: model.modelId,
    modelVersion: model.modelVersion,
    marketFamily: model.marketFamily,
    registryStatus: model.modelStatus,
    policyVersion: registry.policyVersion,
    policyDigest: registry.policyDigest,
    calibrationReportId: model.calibrationReportId,
    calibrationReportDigest: model.calibrationReportDigest,
    validated: model.modelStatus === "validated"
  };
}

function loadRegisteredModels(options = {}) {
  const registryOptions = prepareModelRegistryOptions(options);
  const registry = loadModelRegistry(registryOptions);

  return {
    schemaVersion: registry.schemaVersion,
    policyVersion: registry.policyVersion,
    policyDigest: registry.policyDigest,
    policyRegisteredAt: registry.policyRegisteredAt,
    registryPath: registryOptions.registryPath,
    models: registry.models.map((model) => registeredModelSummary(model, registry))
  };
}

function resolveModelEvidence(identity, options = {}) {
  const modelId = normalizedIdentity(identity.modelId);
  const modelVersion = normalizedIdentity(identity.modelVersion);
  const marketFamily = normalizedIdentity(identity.marketFamily);
  const callerCalibrationStatus = normalizedIdentity(identity.callerCalibrationStatus) ?? "unknown";
  const probabilitySource = normalizedIdentity(identity.probabilitySource) ?? "unknown";
  const baseEvidence = {
    modelId,
    modelVersion,
    marketFamily,
    callerCalibrationStatus,
    probabilitySource,
    registryStatus: "unknown",
    policyVersion: null,
    policyDigest: null,
    calibrationReportId: null,
    calibrationReportDigest: null,
    validated: false
  };

  try {
    const registryOptions = prepareModelRegistryOptions(options);
    const registry = loadModelRegistry(registryOptions);
    const registered = modelId && modelVersion && marketFamily
      ? registry.models.find((model) => (
          model.modelId === modelId
          && model.modelVersion === modelVersion
          && model.marketFamily === marketFamily
        )) ?? null
      : null;

    if (!registered) {
      return {
        ...baseEvidence,
        policyVersion: registry.policyVersion,
        policyDigest: registry.policyDigest
      };
    }

    return {
      ...registeredModelSummary(registered, registry),
      callerCalibrationStatus,
      probabilitySource
    };
  } catch (error) {
    return {
      ...baseEvidence,
      registryError: error instanceof Error ? error.message : String(error)
    };
  }
}

function resolveLiveLegModelEvidence(leg, options = {}) {
  const usesCallerProbability = leg.modelProbabilityOverride !== undefined;
  const evidence = resolveModelEvidence({
    modelId: usesCallerProbability ? normalizedIdentity(leg.modelId) : DEFAULT_MODEL_ID,
    modelVersion: usesCallerProbability ? normalizedIdentity(leg.modelVersion) : DEFAULT_MODEL_VERSION,
    marketFamily: resolveMarketFamily({
      provider: leg.provider,
      statGroup: leg.source?.statGroup,
      statKey: leg.source?.statKey
    }),
    callerCalibrationStatus: leg.calibrationStatus,
    probabilitySource: usesCallerProbability
      ? "caller_probability_override"
      : "registered_internal_implementation"
  }, options);

  return {
    ...evidence,
    validated: evidence.validated && !usesCallerProbability
  };
}

function resolveCandidateModelEvidence(candidate, options = {}) {
  return resolveModelEvidence({
    modelId: candidate.prediction?.model ?? DEFAULT_MODEL_ID,
    modelVersion: candidate.prediction?.modelVersion ?? DEFAULT_MODEL_VERSION,
    marketFamily: resolveMarketFamily({
      provider: candidate.provider,
      statGroup: candidate.statGroup ?? candidate.ticketDraft?.legs?.[0]?.source?.statGroup,
      statKey: candidate.statKey ?? candidate.ticketDraft?.legs?.[0]?.source?.statKey
    }),
    callerCalibrationStatus: candidate.prediction?.calibrationStatus,
    probabilitySource: "registered_internal_implementation"
  }, options);
}

module.exports = {
  DEFAULT_MODEL_ID,
  DEFAULT_MODEL_VERSION,
  loadRegisteredModels,
  prepareModelRegistryOptions,
  readCalibrationReports,
  resolveCandidateModelEvidence,
  resolveLiveLegModelEvidence,
  resolveMarketFamily,
  resolveModelEvidence
};
