const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_LEDGER_PATH = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "logs",
  "odds-credit-ledger.jsonl"
);

// The Odds API free "Starter" plan is 500 credits per month, reset on the
// first of the month. The default cap is set below that ceiling so an
// accounting disagreement between this ledger and the provider's own counter
// cannot silently push past the free tier and trigger a charge.
const FREE_TIER_MONTHLY_CREDITS = 500;
const DEFAULT_MONTHLY_CAP = 450;

/**
 * @param {Date | string} [instant]
 * @returns {string} YYYY-MM
 */
function billingPeriod(instant = new Date()) {
  const date = instant instanceof Date ? instant : new Date(instant);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Billing period requires a valid instant");
  }

  return date.toISOString().slice(0, 7);
}

/**
 * A hard spending ceiling backed by an append-only ledger.
 *
 * This exists because discipline is not a control. A polling loop left running
 * overnight does not intend to spend money; it simply does. Every paid call
 * must reserve credits here first, and a reservation that would breach the cap
 * is refused rather than logged. On a zero-dollar budget the only acceptable
 * failure mode is a call that does not happen.
 */
class CreditBudget {
  /**
   * @param {{
   *   ledgerPath?: string,
   *   monthlyCap?: number,
   *   provider?: string,
   *   now?: () => Date
   * }} [options]
   */
  constructor(options = {}) {
    const monthlyCap = options.monthlyCap
      ?? Number(process.env.ODDS_MONTHLY_CREDIT_CAP)
      ?? DEFAULT_MONTHLY_CAP;

    this.ledgerPath = options.ledgerPath ?? DEFAULT_LEDGER_PATH;
    this.monthlyCap = Number.isFinite(monthlyCap) && monthlyCap >= 0
      ? monthlyCap
      : DEFAULT_MONTHLY_CAP;
    this.provider = options.provider ?? "the_odds_api";
    this.now = options.now ?? (() => new Date());
  }

  /**
   * @returns {Array<{
   *   provider: string,
   *   period: string,
   *   credits: number,
   *   reason: string,
   *   spentAt: string
   * }>}
   */
  readLedger() {
    if (!fs.existsSync(this.ledgerPath)) {
      return [];
    }

    return fs
      .readFileSync(this.ledgerPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  }

  /**
   * @param {string} [period]
   * @returns {number}
   */
  spentInPeriod(period = billingPeriod(this.now())) {
    return this.readLedger()
      .filter((entry) => entry.provider === this.provider && entry.period === period)
      .reduce((total, entry) => total + (Number(entry.credits) || 0), 0);
  }

  /**
   * @param {string} [period]
   * @returns {number}
   */
  remaining(period = billingPeriod(this.now())) {
    return Math.max(0, this.monthlyCap - this.spentInPeriod(period));
  }

  /**
   * Checks whether a spend is permitted without recording it.
   *
   * @param {number} credits
   * @returns {{ allowed: boolean, remaining: number, cap: number, period: string, reason: string | null }}
   */
  check(credits) {
    if (!Number.isFinite(credits) || credits < 0) {
      throw new TypeError("Credit cost must be a non-negative finite number");
    }

    const period = billingPeriod(this.now());
    const remaining = this.remaining(period);
    const allowed = credits <= remaining;

    return {
      allowed,
      remaining,
      cap: this.monthlyCap,
      period,
      reason: allowed
        ? null
        : `spending ${credits} credit(s) would exceed the ${this.monthlyCap} credit cap for ${period}; ${remaining} remaining`
    };
  }

  /**
   * Records a spend. Callers must check() first; spend() enforces the cap again
   * so a caller that forgets cannot breach it.
   *
   * @param {{ credits: number, reason: string }} input
   * @returns {{ period: string, credits: number, remaining: number }}
   */
  spend(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("Spend input must be an object");
    }

    const verdict = this.check(input.credits);

    if (!verdict.allowed) {
      throw new RangeError(verdict.reason ?? "credit cap exceeded");
    }

    const entry = {
      provider: this.provider,
      period: verdict.period,
      credits: input.credits,
      reason: input.reason ?? "unspecified",
      spentAt: this.now().toISOString()
    };

    fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
    fs.appendFileSync(this.ledgerPath, `${JSON.stringify(entry)}\n`, "utf8");

    return {
      period: verdict.period,
      credits: input.credits,
      remaining: verdict.remaining - input.credits
    };
  }

  /**
   * Reconciles the local ledger against the provider's own counter, which is
   * returned on every response as x-requests-remaining. The provider is
   * authoritative; a drift means something spent credits outside this budget.
   *
   * @param {number | null} providerRemaining
   * @returns {{ drift: number | null, providerRemaining: number | null, localRemaining: number, warning: string | null }}
   */
  reconcile(providerRemaining) {
    const localRemaining = this.remaining();

    if (!Number.isFinite(providerRemaining)) {
      return {
        drift: null,
        providerRemaining: null,
        localRemaining,
        warning: null
      };
    }

    const providerSpent = FREE_TIER_MONTHLY_CREDITS - Number(providerRemaining);
    const drift = providerSpent - this.spentInPeriod();

    return {
      drift,
      providerRemaining: Number(providerRemaining),
      localRemaining,
      warning: drift > 0
        ? `provider reports ${drift} more credit(s) spent than this ledger recorded; something is calling the API outside the budget guard`
        : null
    };
  }
}

module.exports = {
  DEFAULT_LEDGER_PATH,
  DEFAULT_MONTHLY_CAP,
  FREE_TIER_MONTHLY_CREDITS,
  CreditBudget,
  billingPeriod
};
