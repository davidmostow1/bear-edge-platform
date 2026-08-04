const test = require("node:test");
const assert = require("node:assert/strict");

const {
  RETROSHEET_ATTRIBUTION,
  RetrosheetBacktestError,
  buildRetrosheetBacktest,
  parseCsv,
  totalBases
} = require("../src/historical/retrosheet-backtest.js");

const SOURCE_DIGESTS = Object.freeze({
  bundle: "a".repeat(64),
  gameinfo: "b".repeat(64),
  batting: "c".repeat(64),
  pitching: "d".repeat(64)
});

function yyyymmdd(day) {
  return `202504${String(day).padStart(2, "0")}`;
}

function gid(day, number = 0) {
  return `HOM${yyyymmdd(day)}${number}`;
}

function fixture(options = {}) {
  const gameinfo = [
    "gid,visteam,hometeam,site,date,number,suspend,gametype,box,season"
  ];
  const batting = [
    "gid,id,team,b_seq,stattype,b_r,b_h,b_d,b_t,b_hr,date,vishome,opp,gametype,box"
  ];
  const pitching = [
    "gid,id,team,p_seq,stattype,p_k,p_gs,date,vishome,opp,gametype,box"
  ];

  for (let day = 1; day <= 12; day += 1) {
    const gameId = gid(day);
    const date = yyyymmdd(day);
    const suspended = options.suspendedDay === day ? "20250430" : "";
    const hits = day % 4;
    const doubles = hits >= 2 ? 1 : 0;
    const triples = hits >= 3 ? 1 : 0;
    const homeRuns = day % 5 === 0 ? 1 : 0;
    const adjustedHits = Math.max(hits, doubles + triples + homeRuns);

    gameinfo.push(
      [gameId, "VIS", "HOM", "SITE1", date, "0", suspended, "regular", "y", "2025"].join(",")
    );
    batting.push([
      gameId,
      "batter01",
      "HOM",
      "1",
      "value",
      String(day % 2),
      String(adjustedHits),
      String(doubles),
      String(triples),
      String(homeRuns),
      date,
      "h",
      "VIS",
      "regular",
      "y"
    ].join(","));
    pitching.push([
      gameId,
      "pitcher01",
      "HOM",
      "1",
      "value",
      String(3 + day % 6),
      "1",
      date,
      "h",
      "VIS",
      "regular",
      "y"
    ].join(","));

    if (day === 11) {
      batting.push([
        gameId,
        "batter01",
        "HOM",
        "1",
        "official",
        "0",
        "2",
        "0",
        "0",
        "0",
        date,
        "h",
        "VIS",
        "regular",
        "y"
      ].join(","));
    }
  }

  if (options.doubleheaderDay) {
    const day = options.doubleheaderDay;
    const gameId = gid(day, 2);
    const date = yyyymmdd(day);
    gameinfo.push(
      [gameId, "VIS", "HOM", "SITE1", date, "2", "", "regular", "y", "2025"].join(",")
    );
    batting.push([
      gameId, "batter01", "HOM", "1", "value", "1", "4", "1", "0", "1",
      date, "h", "VIS", "regular", "y"
    ].join(","));
    pitching.push([
      gameId, "pitcher01", "HOM", "1", "value", "9", "1",
      date, "h", "VIS", "regular", "y"
    ].join(","));
  }

  return {
    gameinfoCsv: `${gameinfo.join("\n")}\n`,
    battingCsv: `${batting.join("\n")}\n`,
    pitchingCsv: `${pitching.join("\n")}\n`,
    allplayersCsv: "id,last,first\nbatter01,Bear,Benny\npitcher01,Bear,Paula\n"
  };
}

function editCsv(csv, predicate, changes) {
  const rows = csv.trimEnd().split("\n").map((line) => line.split(","));
  const header = rows[0];

  for (let index = 1; index < rows.length; index += 1) {
    const record = Object.fromEntries(
      header.map((name, column) => [name, rows[index][column]])
    );

    if (!predicate(record, index)) continue;

    for (const [key, value] of Object.entries(changes)) {
      rows[index][header.indexOf(key)] = value;
    }
  }

  return `${rows.map((row) => row.join(",")).join("\n")}\n`;
}

function build(input, overrides = {}) {
  return buildRetrosheetBacktest(input, {
    season: 2025,
    minHistoryGames: 10,
    recentLimit: 10,
    generatedAt: "2026-07-29T18:30:00.000Z",
    sourceDigests: SOURCE_DIGESTS,
    sourceLocator: "https://www.retrosheet.org/downloads/2025/2025csvs.zip",
    ...overrides
  });
}

test("CSV parser handles quoted commas and escaped quotes", () => {
  assert.deepEqual(parseCsv('a,b\n"Bear, Jr.","said ""hi"""\n'), [{
    a: "Bear, Jr.",
    b: 'said "hi"'
  }]);
});

test("total bases uses hits + doubles + 2*triples + 3*home runs", () => {
  assert.equal(totalBases({ b_h: "4", b_d: "1", b_t: "1", b_hr: "1" }), 10);
  assert.equal(totalBases({ b_h: "1", b_d: "1", b_t: "1", b_hr: "0" }), null);
});

test("historical model rows use prior-date history only and stay outside prospective promotion", () => {
  const result = build(fixture());

  assert.equal(result.records.length, 8);
  assert.equal(result.manifest.summary.distinctEvents, 2);
  assert.equal(result.manifest.summary.markets.batter_hits, 2);
  assert.equal(result.manifest.summary.markets.batter_runs_scored, 2);
  assert.equal(result.manifest.summary.markets.batter_total_bases, 2);
  assert.equal(result.manifest.summary.markets.pitcher_strikeouts, 2);
  assert.equal(result.manifest.prospective, false);
  assert.equal(result.manifest.promotionEligible, false);
  assert.equal(result.manifest.betAuthorization, false);
  assert.equal(result.manifest.source.attribution, RETROSHEET_ATTRIBUTION);

  for (const record of result.records) {
    assert.equal(record.mode, "historical_reconstruction");
    assert.equal(record.prospective, false);
    assert.equal(record.promotionEligible, false);
    assert.equal(record.betAuthorization, false);
    assert.ok(record.features.featureCutoffDate < record.event.date);
    assert.equal(record.features.historyGames, 10 + (record.event.date === yyyymmdd(12) ? 1 : 0));
    assert.equal(record.prediction.canonicalSide, "over");
    assert.ok(record.prediction.probability > 0);
    assert.ok(record.prediction.probability < 1);
    assert.ok(record.outcome.binaryResult === 0 || record.outcome.binaryResult === 1);
    assert.equal(record.source.attribution, RETROSHEET_ATTRIBUTION);
    assert.equal(record.source.suppliedArchiveDigest, SOURCE_DIGESTS.bundle);
    assert.equal(record.model.replicaOf.modelId, "poisson_count_v1");
    assert.equal(record.model.replicaExactness, "approximate_historical_reconstruction");

    const serialized = JSON.stringify(record);
    for (const forbidden of [
      '"marketOdds"',
      '"recommendedStake"',
      '"sportsbook"',
      '"ticketDraft"',
      '"verdict":"BET"'
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  }

  const discrepancy = result.records.find((record) => (
    record.event.date === yyyymmdd(11)
    && record.market.marketFamily === "batter_hits"
  ));
  assert.deepEqual(discrepancy.source.discrepancyTypes, ["official"]);
});

test("current-game outcomes do not alter their own reconstructed forecast", () => {
  const original = fixture();
  const changed = fixture();
  const lines = changed.battingCsv.trimEnd().split("\n");
  const header = lines[0].split(",");
  const gameIndex = header.indexOf("gid");
  const stattypeIndex = header.indexOf("stattype");
  const hitsIndex = header.indexOf("b_h");
  const currentLine = lines.findIndex((line, index) => {
    if (index === 0) return false;
    const fields = line.split(",");
    return fields[gameIndex] === gid(11) && fields[stattypeIndex] === "value";
  });
  const fields = lines[currentLine].split(",");
  fields[hitsIndex] = "20";
  fields[header.indexOf("b_d")] = "0";
  fields[header.indexOf("b_t")] = "0";
  fields[header.indexOf("b_hr")] = "0";
  lines[currentLine] = fields.join(",");
  changed.battingCsv = `${lines.join("\n")}\n`;
  const originalResult = build(original);
  const changedResult = build(changed);
  const findDay11Hits = (result) => result.records.find((record) => (
    record.event.date === yyyymmdd(11)
    && record.market.marketFamily === "batter_hits"
  ));
  const originalRecord = findDay11Hits(originalResult);
  const changedRecord = findDay11Hits(changedResult);

  assert.equal(
    originalRecord.prediction.probability,
    changedRecord.prediction.probability
  );
  assert.equal(originalRecord.market.line, changedRecord.market.line);
  assert.notEqual(originalRecord.outcome.observedValue, changedRecord.outcome.observedValue);
});

test("same-date doubleheaders use the same prior-date history before either result is added", () => {
  const result = build(fixture({ doubleheaderDay: 11 }));
  const day11 = result.records.filter((record) => record.event.date === yyyymmdd(11));
  const day12 = result.records.filter((record) => record.event.date === yyyymmdd(12));

  assert.equal(day11.length, 8);
  assert.ok(day11.every((record) => record.features.historyGames === 10));
  assert.ok(day12.every((record) => record.features.historyGames === 12));
});

test("suspended games are excluded instead of pretending the outcome was known on the original date", () => {
  const result = build(fixture({ suspendedDay: 11 }));

  assert.equal(result.records.length, 4);
  assert.ok(result.manifest.summary.excludedRows.suspended_game > 0);
  assert.ok(result.records.every((record) => record.event.date === yyyymmdd(12)));
  assert.ok(result.records.every((record) => record.features.historyGames === 10));
});

test("the importer requires source digests and a starter indicator", () => {
  assert.throws(
    () => buildRetrosheetBacktest(fixture(), {
      season: 2025,
      sourceDigests: { ...SOURCE_DIGESTS, bundle: "not-a-digest" }
    }),
    (error) => (
      error instanceof RetrosheetBacktestError
      && error.code === "INVALID_SOURCE_DIGEST"
    )
  );

  const input = fixture();
  input.pitchingCsv = input.pitchingCsv.replace(",p_gs,", ",not_starter,");
  assert.throws(
    () => build(input),
    (error) => error instanceof RetrosheetBacktestError && error.code === "MISSING_COLUMN"
  );
});

test("one declared season is required and mixed-season game rows fail closed", () => {
  assert.throws(
    () => buildRetrosheetBacktest(fixture(), {
      sourceDigests: SOURCE_DIGESTS
    }),
    (error) => (
      error instanceof RetrosheetBacktestError
      && error.code === "INVALID_CONFIGURATION"
    )
  );

  const input = fixture();
  input.gameinfoCsv = editCsv(
    input.gameinfoCsv,
    (row) => row.gid === gid(12),
    { season: "2024" }
  );

  assert.throws(
    () => build(input),
    (error) => error instanceof RetrosheetBacktestError && error.code === "SEASON_MISMATCH"
  );
});

test("duplicate, orphan, and cross-file inconsistent source rows fail closed", () => {
  const duplicateGame = fixture();
  duplicateGame.gameinfoCsv += duplicateGame.gameinfoCsv.trimEnd().split("\n")[1] + "\n";
  assert.throws(
    () => build(duplicateGame),
    (error) => error instanceof RetrosheetBacktestError && error.code === "DUPLICATE_GAME"
  );

  const duplicateValue = fixture();
  duplicateValue.battingCsv += duplicateValue.battingCsv.trimEnd().split("\n")[1] + "\n";
  assert.throws(
    () => build(duplicateValue),
    (error) => error instanceof RetrosheetBacktestError && error.code === "DUPLICATE_VALUE_ROW"
  );

  const orphan = fixture();
  orphan.pitchingCsv = editCsv(
    orphan.pitchingCsv,
    (_row, index) => index === 1,
    { gid: "MISSING202504010" }
  );
  assert.throws(
    () => build(orphan),
    (error) => error instanceof RetrosheetBacktestError && error.code === "ORPHAN_PLAYER_ROW"
  );

  for (const [field, value] of [
    ["date", "20250430"],
    ["gametype", "post"],
    ["box", "n"],
    ["team", "VIS"],
    ["opp", "HOM"]
  ]) {
    const mismatch = fixture();
    mismatch.battingCsv = editCsv(
      mismatch.battingCsv,
      (_row, index) => index === 1,
      { [field]: value }
    );
    assert.throws(
      () => build(mismatch),
      (error) => (
        error instanceof RetrosheetBacktestError
        && error.code === "SOURCE_ROW_MISMATCH"
      ),
      `expected ${field} mismatch to fail`
    );
  }
});

test("postseason, all-star, and missing-box games are consistently excluded", () => {
  for (const scenario of [
    { gametype: "post", box: "y", reason: "not_regular_season" },
    { gametype: "asg", box: "y", reason: "not_regular_season" },
    { gametype: "regular", box: "n", reason: "missing_box_score" }
  ]) {
    const input = fixture();
    const matchesDay11 = (row) => row.gid === gid(11);
    input.gameinfoCsv = editCsv(input.gameinfoCsv, matchesDay11, {
      gametype: scenario.gametype,
      box: scenario.box
    });
    input.battingCsv = editCsv(input.battingCsv, matchesDay11, {
      gametype: scenario.gametype,
      box: scenario.box
    });
    input.pitchingCsv = editCsv(input.pitchingCsv, matchesDay11, {
      gametype: scenario.gametype,
      box: scenario.box
    });
    const result = build(input);

    assert.equal(result.records.length, 4);
    assert.ok(result.manifest.summary.excludedRows[scenario.reason] > 0);
    assert.ok(result.records.every((record) => record.event.date === yyyymmdd(12)));
  }
});

test("pitching starter aliases agree with sequence and conflicts fail closed", () => {
  const aliasOnly = fixture();
  aliasOnly.pitchingCsv = aliasOnly.pitchingCsv.replace(",p_gs,", ",gs,");
  assert.equal(build(aliasOnly).records.length, 8);

  const both = fixture();
  const lines = both.pitchingCsv.trimEnd().split("\n").map((line) => line.split(","));
  const starterIndex = lines[0].indexOf("p_gs");
  lines[0].splice(starterIndex + 1, 0, "gs");
  for (let index = 1; index < lines.length; index += 1) {
    lines[index].splice(starterIndex + 1, 0, lines[index][starterIndex]);
  }
  both.pitchingCsv = `${lines.map((row) => row.join(",")).join("\n")}\n`;
  assert.equal(build(both).records.length, 8);

  lines[1][starterIndex + 1] = "0";
  both.pitchingCsv = `${lines.map((row) => row.join(",")).join("\n")}\n`;
  assert.throws(
    () => build(both),
    (error) => error instanceof RetrosheetBacktestError && error.code === "STARTER_FLAG_CONFLICT"
  );

  const sequenceConflict = fixture();
  sequenceConflict.pitchingCsv = editCsv(
    sequenceConflict.pitchingCsv,
    (_row, index) => index === 1,
    { p_seq: "2" }
  );
  assert.throws(
    () => build(sequenceConflict),
    (error) => (
      error instanceof RetrosheetBacktestError
      && error.code === "STARTER_SEQUENCE_CONFLICT"
    )
  );
});

test("nonstarter batting appearances remain explicit history inputs", () => {
  const input = fixture();
  input.battingCsv = editCsv(
    input.battingCsv,
    (row) => row.gid === gid(1) && row.stattype === "value",
    { b_seq: "" }
  );
  const result = build(input);
  const firstHitsTarget = result.records.find((record) => (
    record.event.date === yyyymmdd(11)
    && record.market.marketFamily === "batter_hits"
  ));

  assert.equal(firstHitsTarget.features.historyGames, 10);
  assert.equal(
    result.manifest.configuration.battingFeaturePopulation,
    "all_value_rows_including_nonstarter_appearances"
  );
  assert.ok(result.manifest.warnings.some((warning) => warning.includes("not an exact replay")));
});

test("zero-mean probabilities are preserved as zero and remain replica-only", () => {
  const input = fixture();
  input.battingCsv = editCsv(
    input.battingCsv,
    (row) => row.stattype === "value",
    { b_r: "0" }
  );
  const result = build(input);
  const runRecords = result.records.filter(
    (record) => record.market.marketFamily === "batter_runs_scored"
  );

  assert.ok(runRecords.length > 0);
  assert.ok(runRecords.every((record) => record.prediction.probability === 0));
  assert.ok(runRecords.every((record) => record.model.replicaImplementationDigest));
  assert.ok(runRecords.every((record) => record.prospective === false));
});
