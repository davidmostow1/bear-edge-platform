#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { simulateBetCard } = require("../src/live/probability-causality.js");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT = path.join(PROJECT_ROOT, "examples", "historical-verified-card.json");
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "data", "reports");
const DEFAULT_ITERATIONS = 100;
const DEFAULT_SEED = "bear-edge-2026-06-27-verified-card";

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    iterations: DEFAULT_ITERATIONS,
    seed: DEFAULT_SEED
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--input") {
      args.input = next;
      index += 1;
    } else if (arg === "--output-dir") {
      args.outputDir = next;
      index += 1;
    } else if (arg === "--iterations") {
      args.iterations = Number(next);
      index += 1;
    } else if (arg === "--seed") {
      args.seed = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function formatOdds(value) {
  return Number.isFinite(value) ? (value > 0 ? `+${value}` : String(value)) : "";
}

function percent(value, digits = 2) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "";
}

function money(value) {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : "";
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function buildRunManifest(report, inputText, seed, iterations, startedAt, scenario = "fair") {
  const scenarioSeed = scenario === "fair" ? String(seed) : `${seed}:${scenario}`;

  return {
    runId: `BE-RESEARCH-${report.slateDate ?? "unknown"}-${iterations}-${scenario}`,
    executionVenue: "research_fixture",
    codeVersion: "probability-causality/v2",
    inputSnapshotDigest: sha256(inputText),
    startedAt,
    seed: scenarioSeed,
    model: {
      id: "operator_probability_input",
      version: "1.0.0",
      calibrationStatus: "research_only"
    }
  };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function mdTable(headers, rows) {
  const escape = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((header) => escape(row[header])).join(" | ")} |`)
  ].join("\n");
}

function buildBets(report) {
  const visibleBankroll = Number(report.visibleBankroll ?? report.evidenceClassification?.visibleBankroll);

  return (report.recommendedCard ?? []).map((candidate, index) => ({
    id: `verified_${index + 1}`,
    selection: `${candidate.matchup} ${candidate.selection} moneyline`,
    matchup: candidate.matchup,
    marketType: candidate.marketType,
    marketName: "moneyline",
    americanOdds: candidate.visibleOdds,
    stake: candidate.stake,
    fairProbability: candidate.fairProbability,
    marketImpliedProbability: candidate.visibleImpliedProbability,
    source: {
      sourceType: report.evidenceClassification?.sourceType,
      capturedAt: report.evidenceClassification?.timeWindow,
      bankroll: visibleBankroll,
      sourceFiles: report.evidenceClassification?.sourceFiles ?? []
    },
    evidence: {
      processGrade: candidate.processGrade,
      status: candidate.status,
      sourceSection: candidate.section,
      notes: candidate.notes
    }
  }));
}

function flattenTrialRows(simulation) {
  return simulation.trials.map((trial) => {
    const row = {
      trialNumber: trial.trialNumber,
      amountStaked: trial.amountStaked,
      netProfit: trial.netProfit,
      returnOnStake: trial.returnOnStake,
      endingBankroll: trial.endingBankroll
    };

    for (const outcome of trial.outcomes) {
      const prefix = outcome.betId;
      row[`${prefix}_selection`] = outcome.selection;
      row[`${prefix}_randomDraw`] = outcome.randomDraw;
      row[`${prefix}_simulationProbability`] = outcome.simulationProbability;
      row[`${prefix}_won`] = outcome.won;
      row[`${prefix}_stake`] = outcome.stake;
      row[`${prefix}_netProfit`] = outcome.netProfit;
    }

    return row;
  });
}

function buildCsv(rows) {
  const headers = Object.keys(rows[0] ?? {});

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\n") + "\n";
}

function buildMarkdown(report, simulation, stressResults, trialRows) {
  const betRows = simulation.bets.map((bet) => ({
    Selection: bet.selection,
    Odds: formatOdds(bet.americanOdds),
    Stake: money(bet.stake),
    "Market Implied": percent(bet.marketImpliedProbability),
    "Fair Probability": percent(bet.fairProbability),
    "Simulation Probability": percent(bet.simulationProbability),
    "Expected Net": money(bet.expectedNetProfit),
    "Expected ROI": percent(bet.expectedRoiOnStake),
    "Sim Wins": bet.simulatedWins,
    "Sim Losses": bet.simulatedLosses,
    "Sim Net": money(bet.simulatedNetProfit)
  }));
  const stressRows = stressResults.map((stress) => ({
    Scenario: stress.scenario,
    "Expected Net / Slate": money(stress.expectedNetProfitPerTrial),
    "Expected ROI": percent(stress.expectedReturnOnStake),
    "Sim Mean Net": money(stress.summary.meanNetProfit),
    "Positive Trial Rate": percent(stress.probabilityOfPositiveTrial),
    "5th Percentile": money(stress.summary.percentile05NetProfit),
    "95th Percentile": money(stress.summary.percentile95NetProfit)
  }));
  const trialMdRows = trialRows.map((row) => ({
    Trial: row.trialNumber,
    "AZ Draw": row.verified_1_randomDraw,
    "AZ Won": row.verified_1_won,
    "AZ Net": money(Number(row.verified_1_netProfit)),
    "CHC Draw": row.verified_2_randomDraw,
    "CHC Won": row.verified_2_won,
    "CHC Net": money(Number(row.verified_2_netProfit)),
    "Total Net": money(Number(row.netProfit)),
    "Ending Bankroll": money(Number(row.endingBankroll))
  }));

  return `# Bear Edge Research Simulation

## Evidence Boundary

- Audit status: \`${simulation.evidenceClassification.auditStatus}\`.
- Permission: \`${simulation.evidenceClassification.betCallPermission}\`.
- Authorized stake: ${money(simulation.evidenceClassification.authorizedStake)}.
- Venue: \`${simulation.evidenceClassification.executionVenue}\`.
- Run ID: \`${simulation.runManifest?.runId ?? "missing"}\`.
- Input digest: \`${simulation.runManifest?.inputSnapshotDigest ?? "missing"}\`.

This artifact is reproducible research, not an executable bet. It does not model DraftKings Predictions contract pricing, commissions, exchange fees, liquidity, or settlement terms.

## Context

This simulation uses two historical screenshot-audit inputs from the source report:

- AZ moneyline at +127.
- CHC moneyline at +150.

The reported bankroll in the historical fixture is $${Number(report.visibleBankroll).toFixed(2)}. The source was captured on ${report.evidenceClassification?.date} between ${report.evidenceClassification?.timeWindow}. These inputs are research evidence, not current prices or betting authorization. The simulation uses a deterministic seed: \`${simulation.seed}\`.

This is a predictive risk simulation, not a causal claim. It does not prove that any feature caused either team to win. It tests what a 100-slate replay would look like if the stated ex-ante probabilities were true.

## Baseline Result

- Iterations: ${simulation.iterations}.
- Amount staked per trial: ${money(simulation.amountStakedPerTrial)}.
- Expected net profit per trial: ${money(simulation.expectedNetProfitPerTrial)}.
- Expected return on stake: ${percent(simulation.expectedReturnOnStake)}.
- Simulated mean net profit: ${money(simulation.summary.meanNetProfit)}.
- Simulated median net profit: ${money(simulation.summary.medianNetProfit)}.
- Simulated probability of a positive trial: ${percent(simulation.probabilityOfPositiveTrial)}.
- Worst simulated trial: ${money(simulation.summary.minimumNetProfit)}.
- Best simulated trial: ${money(simulation.summary.maximumNetProfit)}.

## Bet-Level Results

${mdTable([
    "Selection",
    "Odds",
    "Stake",
    "Market Implied",
    "Fair Probability",
    "Simulation Probability",
    "Expected Net",
    "Expected ROI",
    "Sim Wins",
    "Sim Losses",
    "Sim Net"
  ], betRows)}

## Probability Stress Tests

${mdTable([
    "Scenario",
    "Expected Net / Slate",
    "Expected ROI",
    "Sim Mean Net",
    "Positive Trial Rate",
    "5th Percentile",
    "95th Percentile"
  ], stressRows)}

## Causality And Real-World Applicability Upgrade

1. Add a no-causal-claim gate. Every recommendation must state whether it is predictive, causal, or purely market-derived. These two bets are predictive only.
2. Store ex-ante feature timestamps. Starting pitchers, lineups, weather, injuries, bullpen usage, rest, travel, odds, and bankroll must be timestamped before the wager.
3. Track closing-line value separately from win/loss. A good process can lose one game; repeated positive closing-line value is a stronger process signal than isolated outcomes.
4. Add calibration by market type. Fair probabilities need backtesting by bucket, for example 40%-45%, 45%-50%, 50%-55%, and by market family.
5. Add shrinkage scenarios. The app now supports fair, half-edge, adverse-three-points, and market-implied simulations so a card cannot hide behind one optimistic point estimate.
6. Add causal DAG fields to the ledger. For MLB sides, the practical graph should separate pre-treatment factors from post-treatment outcomes:

\`\`\`mermaid
flowchart LR
  Pitcher["Confirmed starters"] --> TrueStrength["Team run prevention / scoring expectation"]
  Lineup["Confirmed lineup"] --> TrueStrength
  Weather["Weather and park"] --> RunEnvironment["Run environment"]
  Bullpen["Bullpen availability"] --> TrueStrength
  Injuries["Pre-game injuries"] --> TrueStrength
  Market["Market price and movement"] --> Selection["Bet selection"]
  TrueStrength --> Outcome["Game result"]
  RunEnvironment --> Outcome
  Selection --> Ledger["Bet ledger result"]
  Outcome --> Ledger
\`\`\`

7. Reject post-treatment leakage. Live score, settled result, and closing outcome cannot enter pre-game fair probability.
8. Require out-of-sample proof before stake expansion. Until the same rule survives historical unseen slates, cap A-tier sides at the existing bankroll-percentage rule.

## Full 100-Trial Baseline Output

${mdTable([
    "Trial",
    "AZ Draw",
    "AZ Won",
    "AZ Net",
    "CHC Draw",
    "CHC Won",
    "CHC Net",
    "Total Net",
    "Ending Bankroll"
  ], trialMdRows)}

## Required Caveats

- The result depends on Bear Edge fair probabilities being calibrated. If the fair probabilities are too high, the positive expected value disappears quickly.
- The two games are treated as independent because no empirical cross-game correlation matrix is attached.
- DraftKings Predictions markets may settle/trade differently than standard sportsbook wagers. The ledger stores payout math from American odds, but the app should keep prediction-market settlement mechanics explicit.
- The simulation is not investment advice, betting advice, or a guarantee. It is a process audit and risk visualization.
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const inputText = await fs.readFile(args.input, "utf8");
  const report = JSON.parse(inputText);
  const bets = buildBets(report);
  const startedAt = new Date().toISOString();
  const baseline = simulateBetCard({
    bets,
    iterations: args.iterations,
    seed: args.seed,
    scenario: "fair",
    startingBankroll: report.visibleBankroll,
    runManifest: buildRunManifest(report, inputText, args.seed, args.iterations, startedAt)
  });
  const stressResults = [
    baseline,
    ...["half_edge", "adverse_three_points", "market"].map((scenario) =>
      simulateBetCard({
        bets,
        iterations: args.iterations,
        seed: `${args.seed}:${scenario}`,
        scenario,
        startingBankroll: report.visibleBankroll,
        runManifest: buildRunManifest(
          report,
          inputText,
          args.seed,
          args.iterations,
          startedAt,
          scenario
        )
      })
    )
  ];
  const trialRows = flattenTrialRows(baseline);
  const basename = `bear_edge_verified_card_simulation_${report.slateDate ?? "unknown"}_${args.iterations}`;
  const outputDir = path.resolve(args.outputDir);
  const jsonPath = path.join(outputDir, `${basename}.json`);
  const csvPath = path.join(outputDir, `${basename}_trials.csv`);
  const markdownPath = path.join(outputDir, `${basename}.md`);
  const payload = {
    sourceReport: args.input,
    generatedAt: new Date().toISOString(),
    infrastructureUpgrade: {
      addedModule: "src/live/probability-causality.js",
      addedEndpoint: "/api/simulate-card",
      modelStatus: "predictive_not_causal",
      requiredNextData: [
        "Historical out-of-sample bet ledger with closing lines",
        "Ex-ante feature snapshots for pitchers, lineups, injuries, bullpen, weather, travel, rest, and market movement",
        "Calibration table by probability bucket and market type",
        "Prediction-market settlement rules and liquidity/exit records"
      ]
    },
    baseline,
    stressResults,
    fullTrialRows: trialRows
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(csvPath, buildCsv(trialRows));
  await fs.writeFile(markdownPath, buildMarkdown(report, baseline, stressResults, trialRows));

  console.log(JSON.stringify({ jsonPath, csvPath, markdownPath, trials: baseline.trials.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
