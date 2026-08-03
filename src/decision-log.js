const path = require("node:path");

const {
  appendAuthoritativeRecord
} = require("./audit/authoritative-ledger.js");

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
  const result = await appendAuthoritativeRecord(decisionLog, {
    ledgerPath: resolvedPath,
    fsImpl: options.fsImpl
  });

  return result.ledgerPath;
}

module.exports = {
  DEFAULT_DECISION_LOG_PATH,
  appendDecisionLog,
  resolveDecisionLogPath
};
