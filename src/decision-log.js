const fs = require("node:fs/promises");
const path = require("node:path");

const {
  appendAuthoritativeRecord
} = require("./audit/authoritative-ledger.js");
const {
  AUDIT_RECORD_SCHEMA_VERSION
} = require("./audit/record-contract.js");

const DEFAULT_DECISION_LOG_PATH = path.resolve(process.cwd(), "data/logs/decision_log.jsonl");

function resolveDecisionLogPath(logPath) {
  if (typeof logPath === "string" && logPath.trim()) {
    return path.resolve(logPath);
  }

  if (typeof process.env.BEAR_EDGE_DECISION_LOG_PATH === "string" && process.env.BEAR_EDGE_DECISION_LOG_PATH.trim()) {
    return path.resolve(process.env.BEAR_EDGE_DECISION_LOG_PATH);
  }

  return DEFAULT_DECISION_LOG_PATH;
}

async function appendDecisionLog(decisionLog, options = {}) {
  const resolvedPath = resolveDecisionLogPath(options.logPath);

  if (decisionLog?.schemaVersion === AUDIT_RECORD_SCHEMA_VERSION) {
    const result = await appendAuthoritativeRecord(decisionLog, {
      ledgerPath: resolvedPath,
      fsImpl: options.fsImpl
    });

    return result.ledgerPath;
  }

  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.appendFile(resolvedPath, `${JSON.stringify(decisionLog)}\n`, "utf8");

  return resolvedPath;
}

module.exports = {
  DEFAULT_DECISION_LOG_PATH,
  appendDecisionLog,
  resolveDecisionLogPath
};
