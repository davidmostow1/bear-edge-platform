# Prompt: How to actually build a probability machine

Paste everything below the line into ChatGPT's normal chat window. It is self-contained — it carries its own context and does not need repo access.

Two notes on why it's built this way:

- It names specific methods (Poisson-binomial, log5, empirical Bayes, isotonic calibration) and asks ChatGPT to either use them or explain why they're wrong. Without that, a question this broad reliably produces confident vagueness.
- It explicitly demands the honest edge assessment. A model asked "how do I build a probability machine" will describe one. Asked "tell me whether this can actually beat a market and where it will fail," it has to reason instead.

---

You are acting as a quantitative modeling collaborator with real experience in sports forecasting, probability calibration, and market microstructure. I want depth, not encouragement.

**Standards for this conversation:**

- Separate clearly: established fact, reasonable inference, subjective judgment, and genuine uncertainty. Label them when it matters.
- Challenge my premises directly if they are weak. If something I've assumed is wrong, say so as the first thing, not buried after praise.
- Do not flatter the plan or call it promising without evidence. If the honest answer is "this specific part probably will not work," say that.
- Do not pad with disclaimers, generic risk warnings, or "consult a professional." I want the technical content.
- Where your knowledge may be stale or where you're genuinely unsure, say so explicitly rather than guessing with confidence.
- Use metaphor only if it clarifies actual mechanics.

**My situation:**

I am building a system to produce calibrated probabilities for MLB player props — starting with pitcher strikeouts (e.g. "Over 5.5 strikeouts"). I have two competing models and a finished evaluation harness that scores them against each other and against the devigged market on mean Brier score, log loss, and closing line value, using an event-clustered bootstrap and refusing to declare a winner below 500 paired predictions across 100 distinct events.

What I do **not** yet have is a defensible probability engine underneath. Right now the "models" produce numbers I cannot justify from first principles. That is the gap I want to close.

Constraints that are real and non-negotiable:

- **Zero dollar budget.** Free data sources and free API tiers only. Any recommendation requiring paid data, paid compute, or a subscription is not actionable — flag it as such rather than recommending it.
- Solo operator. No team.
- I can write and run code.

**What I want from you:**

Answer in these sections, in this order. Be concrete. Where a formula matters, write it out.

**1. What "probability machine" actually means here**
Define precisely what the output must be to be worth anything, and what distinguishes a calibrated probability from a number that merely looks like one. Explain the difference between calibration and discrimination, and why a model can be well-calibrated and still useless — and vice versa.

**2. The generative model, in full mechanical detail**
Walk through pitcher strikeouts specifically, from raw inputs to a probability for a given line.

Address each of these directly. If you think any is the wrong approach, say so and give the better one:

- Why modeling total strikeouts as a simple Poisson draw on a season-long K rate is inadequate, and what the failure mode looks like in practice.
- Decomposing into (a) expected batters faced and (b) per-plate-appearance strikeout probability. How is expected batters faced actually estimated, given that it depends on pitch count limits, manager tendency, score state, and getting pulled early?
- Matchup adjustment: the log5 / odds-ratio method for combining pitcher K rate, batter K rate, and league baseline. Write the formula. State its assumptions and where it breaks.
- Aggregating heterogeneous per-PA probabilities into a distribution over total strikeouts. Why this is a **Poisson-binomial** rather than a binomial or Poisson, how to compute it exactly or approximate it well, and when the approximation error actually matters at the half-run lines that get bet.
- Which contextual factors have real, measurable effect sizes versus which are folklore: park, weather, umpire strike zone, catcher framing, opposing lineup handedness splits, days rest, bullpen state, travel. Give rough magnitudes where you know them and say when you don't.

**3. Parameter uncertainty and small samples**
Most of the inputs are estimated from limited data. Cover:

- Why raw observed rates are overconfident, and what regression to the mean actually does numerically.
- Empirical Bayes / hierarchical shrinkage toward a population prior: the mechanics, how to choose the shrinkage strength, how much data is "enough."
- How parameter uncertainty should propagate into the final probability rather than being ignored — and what it costs you if you ignore it.

**4. The calibration layer**
- Isotonic regression versus Platt scaling versus beta calibration: when each is appropriate, and the sample size each needs.
- How to build a reliability diagram and read it honestly.
- The trap of calibrating on data you also selected features on, and how to avoid it.

**5. The market as information, not just as an opponent**
- What the devigged closing line actually represents, and why it is a genuinely hard baseline to beat on liquid markets.
- Multiplicative versus Shin versus power devig: which distorts favorites and longshots in which direction, and how much it matters at typical prop juice.
- Whether and how to use the market as a Bayesian prior rather than only as a benchmark — and the serious argument against doing that, since it destroys your ability to detect independent edge.
- Where inefficiency in MLB strikeout props is most plausibly still found, and where it is almost certainly gone.

**6. Data: what is required, and what is free**
List the specific inputs the model needs. For each, name concrete free sources (be specific — actual names, and say if you're unsure whether a source is still free or still exists). Distinguish:

- What is genuinely available free and reliable
- What is free but fragile or rate-limited
- What effectively requires money, and what the model loses without it

Be honest if some necessary input has no free source. That is more useful to me than a workaround that doesn't work.

**7. Backtesting without fooling myself**
- Walk-forward / out-of-time validation, and why a random train-test split is invalid here.
- Every lookahead leak specific to this domain that you can enumerate — closing lines, final lineups, injury news, scratched starters, weather updates.
- Why correlated observations within a game require clustered uncertainty estimates, and what happens to your confidence intervals if you ignore that.
- How many settled observations are actually needed before a measured edge is distinguishable from noise, and show the rough power calculation.

**8. The honest assessment**
This section matters most. Do not soften it.

- Realistically, what is the probability that a competent solo operator with free data builds something that beats the devigged closing line on MLB strikeout props? Give a number or a range and defend it.
- What is the most likely way this project fails, specifically?
- What would be the earliest reliable signal that I am wasting my time?
- Is there a version of this that is clearly worth doing even if it never beats the market? Say so if yes, and say plainly if no.

**9. A staged build sequence**
Ordered stages, each with: what gets built, what it costs (zero dollars is the constraint), what it proves, and the explicit kill criterion that says stop or change direction. Put the cheapest thing that could invalidate the whole project as early as possible.

**Finally:** tell me what I have not asked about that I should have — the thing most likely to bite me that isn't in this prompt.
