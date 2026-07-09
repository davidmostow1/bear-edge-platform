const { BET_INPUT_SCHEMA } = require("./validate-bet-input.js");
const { LIVE_TICKET_SCHEMA } = require("./validate-live-ticket.js");

const RESEARCH_PACKET_SCHEMA = Object.freeze({
  type: "object",
  required: ["generatedAt", "ticketKind", "sources", "confidence"],
  properties: {
    generatedAt: { type: "string" },
    ticketKind: { type: "string" },
    confidence: {
      type: "object",
      properties: {
        tier: { type: "string" },
        score: { type: "number" }
      }
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          legId: { type: "string" },
          provider: { type: "string" },
          official: { type: "boolean" },
          sourceUrl: { type: "string" },
          fetchedAt: { type: "string" },
          sourceAgeMinutes: { type: "number" },
          playerName: { type: "string" },
          teamName: { type: "string" },
          statKey: { type: "string" },
          seasonPerGame: { type: "number" },
          recentPerGame: { type: "number" },
          cache: {
            type: "object",
            properties: {
              hit: { type: "boolean" },
              stale: { type: "boolean" }
            }
          }
        }
      }
    },
    notes: {
      type: "array",
      items: { type: "string" }
    }
  }
});

const LIVE_DECISION_SCHEMA = Object.freeze({
  type: "object",
  required: ["kind", "selection", "verdict", "reasons", "riskFlags", "decisionLog", "researchPacket"],
  properties: {
    kind: { type: "string" },
    selection: { type: "string" },
    verdict: { type: "string" },
    reasons: {
      type: "array",
      items: { type: "string" }
    },
    riskFlags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          severity: { type: "string" },
          message: { type: "string" }
        }
      }
    },
    researchPacket: RESEARCH_PACKET_SCHEMA
  }
});

const BET_DECISION_SCHEMA = Object.freeze({
  type: "object",
  required: ["verdict", "reasons", "riskFlags", "decisionLog"],
  properties: {
    verdict: { type: "string" },
    reasons: {
      type: "array",
      items: { type: "string" }
    },
    riskFlags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          severity: { type: "string" },
          message: { type: "string" }
        }
      }
    }
  }
});

module.exports = {
  BET_DECISION_SCHEMA,
  BET_INPUT_SCHEMA,
  LIVE_DECISION_SCHEMA,
  LIVE_TICKET_SCHEMA,
  RESEARCH_PACKET_SCHEMA
};
