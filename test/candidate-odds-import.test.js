const test = require("node:test");
const assert = require("node:assert/strict");

const { matchCandidateOdds } = require("../src/live/candidate-odds-import.js");

function candidate(overrides = {}) {
  return {
    id: "spencer-miles-k",
    line: 3.5,
    lean: "under",
    statKey: "strikeOuts",
    player: { name: "Spencer Miles" },
    ticketDraft: { selection: "Spencer Miles under 3.5 strikeouts" },
    ...overrides
  };
}

test("candidate odds import rejects the opposite market side", () => {
  const result = matchCandidateOdds({
    candidates: [candidate()],
    text: "Spencer Miles over 3.5 strikeouts +138"
  });

  assert.equal(result.summary.matches, 0);
  assert.equal(result.summary.unmatched, 1);
});

test("candidate odds import requires an exact numeric line", () => {
  const result = matchCandidateOdds({
    candidates: [candidate({
      id: "pete-alonso-tb",
      line: 1.5,
      lean: "over",
      statKey: "totalBases",
      player: { name: "Pete Alonso" },
      ticketDraft: { selection: "Pete Alonso over 1.5 total bases" }
    })],
    text: "Pete Alonso over 11.5 total bases +120"
  });

  assert.equal(result.summary.matches, 0);
  assert.equal(result.summary.unmatched, 1);
});

test("candidate odds import does not use a shared surname as player identity", () => {
  const result = matchCandidateOdds({
    candidates: [candidate({
      id: "joe-ryan-k",
      line: 6.5,
      lean: "over",
      player: { name: "Joe Ryan" },
      ticketDraft: { selection: "Joe Ryan over 6.5 strikeouts" }
    })],
    text: "Matt Ryan over 6.5 strikeouts +120"
  });

  assert.equal(result.summary.matches, 0);
  assert.equal(result.summary.unmatched, 1);
});

test("candidate odds import accepts an exact sportsbook alternate threshold", () => {
  const result = matchCandidateOdds({
    candidates: [candidate({
      id: "joe-ryan-k",
      line: 6.5,
      lean: "over",
      player: { name: "Joe Ryan" },
      ticketDraft: { selection: "Joe Ryan over 6.5 strikeouts" }
    })],
    text: "Joe Ryan\n7+ Strikeouts\n-113"
  });

  assert.equal(result.summary.matches, 1);
  assert.equal(result.matches[0].marketOdds, -113);
});
