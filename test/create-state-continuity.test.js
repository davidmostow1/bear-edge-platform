const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FILES = Object.freeze({
  restore: ".cursor/skills/bear-edge-session-restore/SKILL.md",
  handoff: ".cursor/skills/bear-edge-session-handoff/SKILL.md",
  protocol: "docs/canonical/CREATE_STATE_CONTINUITY.md",
  template: "docs/canonical/templates/CREATE_STATE_HANDOFF.yaml"
});

function readRequired(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  assert.equal(
    fs.existsSync(fullPath),
    true,
    `missing required continuity artifact: ${relativePath}`
  );
  return fs.readFileSync(fullPath, "utf8");
}

function assertIncludesAll(content, expected, label) {
  for (const value of expected) {
    assert.match(content, value, `${label} must include ${String(value)}`);
  }
}

function assertOrdered(content, first, second, label) {
  const firstIndex = content.indexOf(first);
  const secondIndex = content.indexOf(second);
  assert.notEqual(firstIndex, -1, `${label} must include ${first}`);
  assert.notEqual(secondIndex, -1, `${label} must include ${second}`);
  assert.ok(firstIndex < secondIndex, `${label} must place ${first} before ${second}`);
}

test("all Bear Edge continuity artifacts exist", () => {
  for (const relativePath of Object.values(FILES)) {
    readRequired(relativePath);
  }
});

test("restore skill selects by project identity and fails closed on conflicting evidence", () => {
  const content = readRequired(FILES.restore);

  assert.match(content, /^---\nname: bear-edge-session-restore\n/m);
  assert.match(
    content,
    /^description: Safely restore Bear Edge context, then verify it against repository evidence\.\n/m
  );

  assertIncludesAll(
    content,
    [
      /listHandoffPackages/,
      /restoreFromHandoff/,
      /listUserWorldModels/,
      /getProjectWorldModel/,
      /project match[^\n]*before[^\n]*recency/i,
      /never (?:merge|combine)[^\n]*handoffs/i,
      /GitHub[^\n]*authoritative/i,
      /working[- ]tree/i,
      /verification command/i,
      /Supabase/i,
      /ESTABLISHED_FACT/,
      /REASONABLE_INFERENCE/,
      /OPEN_QUESTION/,
      /UNKNOWN/,
      /NOT_RUN/,
      /HTTP|authentication/i,
      /stop before (?:editing|edits|implementation|changes)/i,
      /RESEARCH_ONLY/,
      /authorized stake[^\n]*\$0/i,
      /execution[^\n]*disabled/i
    ],
    "restore skill"
  );
});

test("handoff skill captures evidence before creating a handoff and never invents success", () => {
  const content = readRequired(FILES.handoff);

  assert.match(content, /^---\nname: bear-edge-session-handoff\n/m);
  assert.match(
    content,
    /^description: Save an evidence-backed Bear Edge handoff without promoting memory to authority\.\n/m
  );

  assertIncludesAll(
    content,
    [
      /fresh (?:repository|git) evidence/i,
      /npm run verify/,
      /NOT_RUN/,
      /captureConversationContext/,
      /createSessionHandoff/,
      /API keys/i,
      /access tokens/i,
      /cookies/i,
      /one-time codes/i,
      /unredacted screenshots/i,
      /must not claim|never claim/i,
      /successful tool response/i,
      /RESEARCH_ONLY/,
      /authorized stake[^\n]*\$0/i,
      /execution[^\n]*disabled/i
    ],
    "handoff skill"
  );
  assertOrdered(
    content,
    "captureConversationContext",
    "createSessionHandoff",
    "handoff skill"
  );
});

test("canonical protocol keeps durable evidence above continuity memory", () => {
  const content = readRequired(FILES.protocol);

  assertIncludesAll(
    content,
    [
      /GitHub[^\n]*code authority/i,
      /Supabase[^\n]*durable[^\n]*append-only/i,
      /Local JSONL[^\n]*write-ahead/i,
      /repository canonical documentation/i,
      /Create State[^\n]*continuity memory only/i,
      /conversation transcripts/i,
      /Start of session/i,
      /During the session/i,
      /End of session/i,
      /HTTP 403/i,
      /physical (?:Mac|Cursor environment)[^\n]*not verified/i,
      /RESEARCH_ONLY/,
      /authorized stake[^\n]*\$0/i,
      /execution[^\n]*disabled/i
    ],
    "canonical protocol"
  );
});

test("handoff template contains explicit evidence, uncertainty, and safety fields", () => {
  const content = readRequired(FILES.template);

  assertIncludesAll(
    content,
    [
      /^schema_version:/m,
      /^project:/m,
      /^  name:/m,
      /^  repository:/m,
      /^  local_path:/m,
      /^  remote:/m,
      /^repository_state:/m,
      /^  branch:/m,
      /^  commit:/m,
      /^  base_commit:/m,
      /^  working_tree:/m,
      /^current_stage:/m,
      /^  plan_stage:/m,
      /^  vertical_slice:/m,
      /^verification:/m,
      /^  command: npm run verify/m,
      /^  result: NOT_RUN/m,
      /^  evidence_timestamp_utc:/m,
      /^  test_count:/m,
      /^authority:/m,
      /^  code: GitHub/m,
      /^  event_journal: Supabase/m,
      /^  offline_journal: Local JSONL/m,
      /^  session_memory: Create State/m,
      /^authorization:/m,
      /^  mode: RESEARCH_ONLY/m,
      /^  authorized_stake_usd: 0/m,
      /^  execution_enabled: false/m,
      /^verified_facts:/m,
      /^reasonable_inferences:/m,
      /^open_questions:/m,
      /^blockers:/m,
      /^next_safe_action:/m,
      /^prohibited_actions:/m,
      /^secret_redaction_confirmed: false/m
    ],
    "handoff template"
  );
});

test("durable continuity artifacts preserve the fixed zero-dollar research boundary", () => {
  const contents = [
    readRequired(FILES.restore),
    readRequired(FILES.handoff),
    readRequired(FILES.protocol),
    readRequired(FILES.template)
  ];

  for (const [index, content] of contents.entries()) {
    assert.match(content, /RESEARCH_ONLY/, `artifact ${index + 1} must preserve RESEARCH_ONLY`);
    assert.match(
      content,
      /(?:authorized stake[^\n]*\$0|authorized_stake_usd: 0)/i,
      `artifact ${index + 1} must preserve zero authorized stake`
    );
    assert.match(
      content,
      /(?:execution[^\n]*disabled|execution_enabled: false)/i,
      `artifact ${index + 1} must preserve disabled execution`
    );
  }
});
