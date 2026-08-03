const { BET_INPUT_SCHEMA } = require("./validate-bet-input.js");
const { LIVE_TICKET_SCHEMA } = require("./validate-live-ticket.js");
const { AUDIT_RECORD_SCHEMA } = require("./audit/record-contract.js");

const SETTLEMENT_INPUT_SCHEMA = Object.freeze({
  title: "Bear Edge Settlement Input",
  type: "object",
  additionalProperties: false,
  required: ["evaluationId", "outcome"],
  properties: {
    evaluationId: { type: "string", minLength: 1 },
    outcome: { type: "string", enum: ["pending", "win", "loss", "push", "void"] },
    settledAt: { type: "string", format: "date-time" },
    closingOdds: { type: "number", not: { const: 0 } },
    closingOppositeOdds: { type: "number", not: { const: 0 } },
    closingLineEvidence: {
      type: "object",
      additionalProperties: false,
      required: [
        "sportsbook",
        "capturedAt",
        "marketClosedAt",
        "isFinal",
        "sourceLocator",
        "sourceDigest"
      ],
      properties: {
        sportsbook: { type: "string", minLength: 1 },
        capturedAt: { type: "string", format: "date-time" },
        marketClosedAt: { type: "string", format: "date-time" },
        isFinal: { type: "boolean" },
        sourceLocator: { type: "string", minLength: 1 },
        sourceDigest: { type: "string", pattern: "^[a-f0-9]{64}$" }
      }
    },
    stake: { type: "number", minimum: 0 },
    profit: { type: "number" },
    notes: {
      oneOf: [
        { type: "string" },
        { type: "array", items: { type: "string" } }
      ]
    }
  }
});

const VERIFIED_SOURCE_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "provider",
    "sourceType",
    "sourceLocator",
    "capturedAt",
    "sourceTime",
    "digest",
    "verificationStatus"
  ],
  properties: {
    provider: { type: "string", minLength: 1 },
    sourceType: { type: "string", minLength: 1 },
    sourceLocator: { type: "string", minLength: 1 },
    capturedAt: { type: "string", format: "date-time" },
    sourceTime: { type: "string", format: "date-time" },
    digest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    verificationStatus: { type: "string", minLength: 1 }
  }
});

const NOTES_INPUT_SCHEMA = Object.freeze({
  oneOf: [
    { type: "string" },
    { type: "array", items: { type: "string" } }
  ]
});

const PREDICTION_OUTCOME_INPUT_SCHEMA = Object.freeze({
  title: "Bear Edge Prediction Outcome Input",
  type: "object",
  additionalProperties: false,
  required: [
    "evaluationId",
    "supersedesId",
    "outcome",
    "resolvedAt",
    "eventResult",
    "marketResult",
    "source"
  ],
  properties: {
    evaluationId: { type: "string", minLength: 1 },
    supersedesId: {
      oneOf: [
        { type: "null" },
        {
          type: "string",
          pattern: "^outcome_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
        }
      ]
    },
    outcome: { type: "string", enum: ["win", "loss", "push", "void"] },
    resolvedAt: { type: "string", format: "date-time" },
    eventResult: {
      type: "object",
      additionalProperties: false,
      required: ["status", "homeScore", "awayScore"],
      properties: {
        status: { const: "final" },
        homeScore: { type: ["integer", "null"], minimum: 0, maximum: 2147483647 },
        awayScore: { type: ["integer", "null"], minimum: 0, maximum: 2147483647 }
      }
    },
    marketResult: {
      type: "object",
      additionalProperties: false,
      required: ["observedValue", "unit"],
      properties: {
        observedValue: { type: ["number", "null"] },
        unit: { type: "string", minLength: 1 }
      }
    },
    source: VERIFIED_SOURCE_INPUT_SCHEMA,
    notes: NOTES_INPUT_SCHEMA
  }
});

const CLOSING_PRICE_INPUT_SCHEMA = Object.freeze({
  title: "Bear Edge Closing Price Input",
  type: "object",
  additionalProperties: false,
  required: ["evaluationId", "supersedesId", "price", "source"],
  properties: {
    evaluationId: { type: "string", minLength: 1 },
    supersedesId: {
      oneOf: [
        { type: "null" },
        {
          type: "string",
          pattern: "^close_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
        }
      ]
    },
    price: {
      type: "object",
      additionalProperties: false,
      required: ["sportsbook", "marketOdds", "oppositeOdds", "marketClosedAt", "isFinal"],
      properties: {
        sportsbook: { type: "string", minLength: 1 },
        marketOdds: {
          type: "integer",
          anyOf: [
            { minimum: -100000, maximum: -100 },
            { minimum: 100, maximum: 100000 }
          ]
        },
        oppositeOdds: {
          type: "integer",
          anyOf: [
            { minimum: -100000, maximum: -100 },
            { minimum: 100, maximum: 100000 }
          ]
        },
        marketClosedAt: { type: "string", format: "date-time" },
        isFinal: { const: true }
      }
    },
    source: VERIFIED_SOURCE_INPUT_SCHEMA,
    notes: NOTES_INPUT_SCHEMA
  }
});

const AMENDMENT_INPUT_SCHEMA = Object.freeze({
  title: "Bear Edge Amendment Input",
  type: "object",
  additionalProperties: false,
  required: ["evaluationId", "settlementId", "reason", "patch"],
  properties: {
    evaluationId: { type: "string", minLength: 1 },
    settlementId: { type: "string", minLength: 1 },
    reason: { type: "string", minLength: 1 },
    patch: {
      type: "object",
      minProperties: 1,
      additionalProperties: false,
      properties: {
        outcome: { type: "string", enum: ["pending", "win", "loss", "push", "void"] },
        settledAt: { type: "string", format: "date-time" },
        closingOdds: { type: ["number", "null"], not: { const: 0 } },
        closingOppositeOdds: { type: ["number", "null"], not: { const: 0 } },
        closingLineEvidence: {
          oneOf: [
            { type: "null" },
            SETTLEMENT_INPUT_SCHEMA.properties.closingLineEvidence
          ]
        },
        stake: { type: ["number", "null"], minimum: 0 },
        profit: { type: ["number", "null"] },
        notes: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } }
          ]
        }
      }
    }
  }
});

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
  AMENDMENT_INPUT_SCHEMA,
  AUDIT_RECORD_SCHEMA,
  BET_DECISION_SCHEMA,
  BET_INPUT_SCHEMA,
  CLOSING_PRICE_INPUT_SCHEMA,
  LIVE_DECISION_SCHEMA,
  LIVE_TICKET_SCHEMA,
  PREDICTION_OUTCOME_INPUT_SCHEMA,
  RESEARCH_PACKET_SCHEMA,
  SETTLEMENT_INPUT_SCHEMA
};
