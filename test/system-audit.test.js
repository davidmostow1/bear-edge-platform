const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { getSystemAudit } = require("../src/system-audit.js");

function writeFixture(rootDir, relativePath, contents = "") {
  const filePath = path.join(rootDir, relativePath);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

test("system audit treats bundled Node as optional when required app files exist", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-system-audit-"));

  writeFixture(rootDir, "package.json", JSON.stringify({ name: "fixture", scripts: {} }));
  writeFixture(rootDir, "tsconfig.json", "{}");
  writeFixture(rootDir, "src/server.js");
  writeFixture(rootDir, "src/dashboard/index.html");
  writeFixture(rootDir, "src/dashboard/app.js");
  writeFixture(rootDir, "src/dashboard/styles.css");

  const audit = await getSystemAudit({ rootDir });

  assert.equal(audit.readiness.localFilesOk, true);
  assert.equal(audit.readiness.bundledNodeAvailable, false);
  assert.equal(audit.readiness.bundledNpmAvailable, false);
});

test("system audit exposes safe runtime controls without returning secrets", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-runtime-audit-"));

  writeFixture(rootDir, "package.json", JSON.stringify({ name: "fixture", scripts: {} }));
  writeFixture(rootDir, "tsconfig.json", "{}");
  writeFixture(rootDir, "src/server.js");
  writeFixture(rootDir, "src/dashboard/index.html");
  writeFixture(rootDir, "src/dashboard/app.js");
  writeFixture(rootDir, "src/dashboard/styles.css");

  const audit = await getSystemAudit({
    rootDir,
    operatorAuthStatus: {
      provider: "bear_edge_operator_auth",
      required: true,
      lanMode: true,
      mode: "bearer_token",
      tokenSource: "generated",
      digestAlgorithm: "sha256",
      secretReturned: false
    },
    statsigStatus: {
      provider: "statsig",
      configured: false,
      initialized: false,
      mode: "control_fallback",
      secretReturned: false
    }
  });

  assert.equal(audit.runtimeControls.operatorAuth.required, true);
  assert.equal(audit.runtimeControls.operatorAuth.lanMode, true);
  assert.equal(audit.runtimeControls.statsig.mode, "control_fallback");
  assert.equal(audit.readiness.operatorWriteBoundaryReady, true);
  assert.equal(audit.readiness.statsigFailClosed, true);
  assert.equal(JSON.stringify(audit.runtimeControls).includes("private-token"), false);
});
