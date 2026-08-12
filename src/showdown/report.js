const {
  BEAR_EDGE_MODEL_KEY,
  MARKET_BASELINE_MODEL_KEY,
  SWEET_BEAR_MODEL_KEY
} = require("./records.js");
const { STATUS_WINNER_AUTHORIZED } = require("./compare.js");

const MODEL_LABELS = Object.freeze({
  [SWEET_BEAR_MODEL_KEY]: "Sweet Bear",
  [BEAR_EDGE_MODEL_KEY]: "Bear Edge",
  [MARKET_BASELINE_MODEL_KEY]: "Market baseline (devig)"
});

const UNAVAILABLE = "unavailable";

/**
 * @param {number | null | undefined} value
 * @param {number} [digits]
 * @returns {string}
 */
function formatNumber(value, digits = 6) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return UNAVAILABLE;
  }

  return value.toFixed(digits);
}

/**
 * @param {{ lower?: number | null, upper?: number | null } | null | undefined} interval
 * @returns {string}
 */
function formatInterval(interval) {
  if (
    !interval
    || typeof interval.lower !== "number"
    || typeof interval.upper !== "number"
  ) {
    return `{"lower":null,"upper":null}`;
  }

  return `{"lower":${formatNumber(interval.lower)},"upper":${formatNumber(interval.upper)}}`;
}

/**
 * @param {object | null} score
 * @param {string} label
 * @returns {string}
 */
function scoreRow(score, label) {
  if (!score) {
    return `| ${label} | ${UNAVAILABLE} | ${UNAVAILABLE} | ${UNAVAILABLE} |`;
  }

  return [
    `| ${label}`,
    formatNumber(score.meanBrier),
    formatNumber(score.meanLogLoss),
    formatNumber(score.classificationAccuracy, 4)
  ].join(" | ") + " |";
}

/**
 * @param {string} modelKey
 * @param {{
 *   mean: number | null,
 *   lower: number | null,
 *   upper: number | null,
 *   excludesZero: boolean
 * }} interval
 * @returns {string}
 */
function describeMarketVerdict(modelKey, interval) {
  if (interval.mean === null) {
    return `- ${MODEL_LABELS[modelKey]} vs market: ${UNAVAILABLE}`;
  }

  const direction = interval.mean < 0 ? "better than" : "worse than";
  const significance = interval.excludesZero
    ? "interval excludes zero"
    : "interval includes zero, so no demonstrated edge";

  return [
    `- ${MODEL_LABELS[modelKey]} vs market:`,
    `${formatNumber(interval.mean)} (${direction} the devigged market;`,
    `${significance}; 95% CI ${formatInterval(interval)})`
  ].join(" ");
}

/**
 * @param {object} comparison
 * @param {{
 *   exclusionCounts?: Record<string, number>,
 *   missingness?: Record<string, object>,
 *   clv?: Record<string, object | null>,
 *   generatedAt?: string
 * }} [context]
 * @returns {string}
 */
function renderMarkdownReport(comparison, context = {}) {
  const lines = [];

  lines.push("# Sweet Bear vs Bear Edge Model Showdown");
  lines.push(`Status: **${comparison.status}**`);
  lines.push(`Provisional leader: \`${comparison.provisionalLeader}\``);

  if (comparison.status === STATUS_WINNER_AUTHORIZED) {
    lines.push(`Authorized accuracy winner: \`${comparison.authorizedWinner}\``);
  } else {
    lines.push("No accuracy winner is authorized.");
    lines.push(
      "The provisional leader is a diagnostic only. Do not quote it as a result before the gate closes."
    );
  }

  lines.push("");
  lines.push("## Paired sample");
  lines.push(`- Settled paired predictions: ${comparison.pairedPredictions}`);
  lines.push(`- Distinct events: ${comparison.distinctEvents}`);
  lines.push("");
  lines.push("## Scores");
  lines.push("| Model | Mean Brier | Mean log loss | Classification accuracy |");
  lines.push("|---|---:|---:|---:|");
  lines.push(scoreRow(comparison.scores[SWEET_BEAR_MODEL_KEY], "Sweet Bear"));
  lines.push(scoreRow(comparison.scores[BEAR_EDGE_MODEL_KEY], "Bear Edge"));
  lines.push(
    scoreRow(comparison.scores[MARKET_BASELINE_MODEL_KEY], "Market baseline (devig)")
  );
  lines.push("");
  lines.push("## Versus the market");
  lines.push(
    "Beating the other model is not the same as beating the price. A model that"
  );
  lines.push(
    "wins the head-to-head while losing to the devigged market has no edge worth acting on."
  );
  lines.push("");
  lines.push(
    describeMarketVerdict(SWEET_BEAR_MODEL_KEY, comparison.versusMarket[SWEET_BEAR_MODEL_KEY])
  );
  lines.push(
    describeMarketVerdict(BEAR_EDGE_MODEL_KEY, comparison.versusMarket[BEAR_EDGE_MODEL_KEY])
  );

  if (context.clv) {
    lines.push("");
    lines.push("## Closing line value");
    Object.entries(context.clv).forEach(([modelKey, summary]) => {
      if (!summary) {
        lines.push(`- ${MODEL_LABELS[modelKey] ?? modelKey}: ${UNAVAILABLE}`);
        return;
      }
      lines.push(
        `- ${MODEL_LABELS[modelKey] ?? modelKey}: mean CLV `
        + `${formatNumber(summary.meanClvProbabilityPoints)} probability points `
        + `across ${summary.count} priced predictions `
        + `(beat close ${(summary.beatCloseRate * 100).toFixed(1)}%)`
      );
    });
  }

  lines.push("");
  lines.push("## Winner gate");
  lines.push(`- Minimum paired predictions: ${comparison.gate.minPairedPredictions}`);
  lines.push(`- Minimum distinct events: ${comparison.gate.minDistinctEvents}`);
  lines.push(`- Event-cluster bootstrap samples: ${comparison.gate.bootstrapSamples}`);
  lines.push(
    `- Paired Brier delta 95% interval: ${formatInterval(comparison.headToHead)}`
  );
  lines.push(
    `- Paired predictions condition met: ${comparison.gate.pairedPredictionsMet}`
  );
  lines.push(`- Distinct events condition met: ${comparison.gate.distinctEventsMet}`);
  lines.push(
    `- Interval excludes zero: ${comparison.gate.intervalExcludesZero}`
  );

  if (context.missingness) {
    lines.push("");
    lines.push("## Missingness");
    lines.push(
      "Asymmetric absence biases the surviving sample. If one model is missing"
    );
    lines.push(
      "far more often than the other, the paired set is not a random sample of games."
    );
    lines.push("");
    lines.push("| Model | Produced | Absent while another model answered |");
    lines.push("|---|---:|---:|");
    Object.entries(context.missingness).forEach(([modelKey, summary]) => {
      lines.push(
        `| ${MODEL_LABELS[modelKey] ?? modelKey} | ${summary.produced} | ${summary.absentWhenOthersProduced} |`
      );
    });
  }

  if (context.exclusionCounts && Object.keys(context.exclusionCounts).length > 0) {
    lines.push("");
    lines.push("## Excluded comparisons");
    lines.push("| Reason | Count |");
    lines.push("|---|---:|");
    Object.entries(context.exclusionCounts)
      .sort((left, right) => right[1] - left[1])
      .forEach(([reason, count]) => {
        lines.push(`| ${reason} | ${count} |`);
      });
  }

  lines.push("");
  lines.push(
    "Lower Brier and log loss are better. A negative paired Brier delta favors Sweet Bear."
  );
  lines.push(
    "Only exact same-market, same-line, same-selection, same-event, same-cutoff"
  );
  lines.push("predictions with an official MLB outcome are scored.");

  if (context.generatedAt) {
    lines.push("");
    lines.push(`Generated at ${context.generatedAt}.`);
  }

  return lines.join("\n") + "\n";
}

module.exports = {
  MODEL_LABELS,
  formatInterval,
  formatNumber,
  renderMarkdownReport
};
