const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createAutoUpdateService,
  readAutoUpdateSnapshot
} = require("../src/live/auto-update.js");

test("path traversal: rejects .. in relative paths", async () => {
  // Path traversal using .. to escape intended directory
  const maliciousPath = "../../../etc/passwd";
  
  await assert.rejects(
    async () => {
      await readAutoUpdateSnapshot({
        autoUpdateSnapshotPath: maliciousPath
      });
    },
    {
      message: "Invalid snapshot path"
    },
    "Should reject path with .. traversal"
  );
});

test("path traversal: rejects absolute paths to sensitive files", async () => {
  // Direct absolute path to sensitive system file
  const absolutePath = "/etc/passwd";
  
  await assert.rejects(
    async () => {
      await readAutoUpdateSnapshot({
        autoUpdateSnapshotPath: absolutePath
      });
    },
    {
      message: "Invalid snapshot path"
    },
    "Should reject absolute paths to prevent arbitrary file access"
  );
});

test("path traversal: rejects mixed relative/absolute traversal attempts", async () => {
  // Various forms of path traversal attacks
  const maliciousPaths = [
    "data/../../../etc/passwd",           // Mixed with valid path component
    "data/logs/../../../../../../etc/passwd",  // Deep traversal
    "data/cache/../../../etc/shadow"      // Targeting different sensitive file
  ];
  
  for (const maliciousPath of maliciousPaths) {
    await assert.rejects(
      async () => {
        await readAutoUpdateSnapshot({
          autoUpdateSnapshotPath: maliciousPath
        });
      },
      {
        message: "Invalid snapshot path"
      },
      `Should reject path traversal: ${maliciousPath}`
    );
  }
});

test("path traversal: accepts safe relative paths without traversal", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-security-"));
  const validPath = path.join(tempDir, "valid_snapshot.json");
  
  // Create a valid snapshot file
  const validSnapshot = {
    recordType: "auto_update_snapshot",
    games: { games: [] },
    candidates: { candidates: [] }
  };
  
  fs.writeFileSync(validPath, JSON.stringify(validSnapshot, null, 2));
  
  // Change to temp directory to test relative path
  const originalCwd = process.cwd();
  try {
    process.chdir(tempDir);
    
    // This should work - simple relative path without any traversal
    const result = await readAutoUpdateSnapshot({
      autoUpdateSnapshotPath: "valid_snapshot.json"
    });
    
    assert.equal(result.exists, true);
    assert.equal(result.snapshot.recordType, "auto_update_snapshot");
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("path traversal: service creation rejects malicious paths", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-security-"));
  
  try {
    // Try to create a service with a path traversal attempt
    // This should throw immediately during service creation
    assert.throws(
      () => {
        createAutoUpdateService({
          intervalMs: 60_000,
          fetchJsonImpl: async () => ({ games: [] }),
          fetchTextImpl: async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            contentType: "text/plain",
            text: ""
          }),
          autoUpdateSnapshotPath: "../../../etc/passwd"
        });
      },
      {
        message: "Invalid snapshot path"
      },
      "Should reject service creation with malicious snapshot path"
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("path traversal: uses default path when none provided", async () => {
  // When no custom path is provided, it should use the safe default
  const result = await readAutoUpdateSnapshot({
    autoUpdateSnapshotPath: undefined
  });
  
  // Should not throw, but file may not exist (which is fine)
  assert.ok(typeof result.exists === "boolean");
  assert.ok(result.snapshotPath.includes("auto_update_snapshot.json"));
  // Verify default path is absolute and safe
  assert.ok(path.isAbsolute(result.snapshotPath));
});

test("path traversal: rejects Windows-style path traversal", async () => {
  // Windows-style path traversal attempts
  const windowsPaths = [
    "..\\..\\..\\windows\\system32\\config\\sam",
    "data\\..\\..\\..\\windows\\system32"
  ];
  
  for (const maliciousPath of windowsPaths) {
    await assert.rejects(
      async () => {
        await readAutoUpdateSnapshot({
          autoUpdateSnapshotPath: maliciousPath
        });
      },
      {
        message: "Invalid snapshot path"
      },
      `Should reject Windows path traversal: ${maliciousPath}`
    );
  }
});
