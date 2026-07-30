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
