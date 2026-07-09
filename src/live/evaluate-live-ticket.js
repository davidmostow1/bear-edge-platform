const { appendDecisionLog } = require("../decision-log.js");
const { createId } = require("../analytics.js");
const { LiveDataCache } = require("./cache.js");
const { getProvider } = require("./provider-registry.js");
const { buildResearchPacket } = require("./research-packet.js");
const { fetchMlbPlayerPropSnapshot } = require("./providers/mlb.js");
const { fetchNhlPlayerPropSnapshot } = require("./providers/nhl.js");
const { combineParlayLegs, evaluateLiveLeg } = require("./estimate-prop.js");

const PROVIDERS = Object.freeze({
  mlb: fetchMlbPlayerPropSnapshot,
  nhl: fetchNhlPlayerPropSnapshot
});

async function fetchLegSnapshot(leg, options = {}) {
  const cache = options.cache ?? new LiveDataCache({
    refreshIntervalMs: options.refreshIntervalMs
  });

  if (options.disableCache) {
    const provider = getProvider(leg.provider);
    return provider(leg.source, options);
  }

  return cache.getSnapshotForLeg(leg, options);
}

async function evaluateLiveTicket(ticket, options = {}) {
  const legResults = [];

  for (const leg of ticket.legs) {
    const snapshot = await fetchLegSnapshot(leg, options);
    legResults.push(
      evaluateLiveLeg(leg, snapshot, {
        bankroll: ticket.bankroll,
        livePolicy: ticket.livePolicy
      })
    );
  }
  const researchPacket = buildResearchPacket(ticket, legResults);

  const result =
    ticket.kind === "parlay"
      ? combineParlayLegs(ticket, legResults)
      : {
          kind: "single",
          selection: ticket.selection ?? legResults[0].selection,
          ...legResults[0]
        };

  const decisionLog = {
    id: createId("eval"),
    recordType: "evaluation",
    timestamp: new Date().toISOString(),
    kind: result.kind,
    selection: result.selection,
    verdict: result.verdict,
    reasons: result.reasons,
    riskFlags: result.riskFlags,
    researchPacket,
    ticket,
    result
  };

  return {
    ...result,
    researchPacket,
    decisionLog
  };
}

async function evaluateLiveTicketAndLog(ticket, options = {}) {
  const result = await evaluateLiveTicket(ticket, options);
  const logPath = options.writeLog === false ? null : await appendDecisionLog(result.decisionLog, options);

  return {
    ...result,
    logPath
  };
}

module.exports = {
  evaluateLiveTicket,
  evaluateLiveTicketAndLog
};
