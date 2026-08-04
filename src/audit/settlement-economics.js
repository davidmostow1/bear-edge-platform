const FINAL_SETTLEMENT_OUTCOMES = new Set(["win", "loss", "push", "void"]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getSettlementEconomicsIssue(settlement, options = {}) {
  const outcome = settlement?.outcome;
  const profit = settlement?.profit;

  if (outcome === "pending") {
    return profit === undefined || profit === null
      ? null
      : "A pending settlement cannot include profit.";
  }

  if (!FINAL_SETTLEMENT_OUTCOMES.has(outcome)) {
    return null;
  }

  if (
    options.requireFinalValues === true &&
    (!isFiniteNumber(settlement?.stake) || settlement.stake <= 0 || !isFiniteNumber(profit))
  ) {
    return "A final settlement requires a positive stake and explicit profit.";
  }

  if (!isFiniteNumber(profit)) {
    return null;
  }

  if (outcome === "win" && profit <= 0) {
    return "A win settlement requires positive profit.";
  }

  if (outcome === "loss" && profit >= 0) {
    return "A loss settlement requires negative profit.";
  }

  if (outcome === "push" && profit !== 0) {
    return "A push settlement requires zero profit.";
  }

  if (outcome === "void" && profit !== 0) {
    return "A void settlement requires zero profit.";
  }

  return null;
}

module.exports = {
  getSettlementEconomicsIssue
};
