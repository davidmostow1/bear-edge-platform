const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { saveProviderApiKey } = require("../src/config/provider-key-settings.js");

test("a provider-key persistence failure leaves the running environment unchanged", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-provider-rollback-"));
  const blockingFile = path.join(tempDir, "not-a-directory");
  const previousValue = process.env.SPORTSDATAIO_API_KEY;
  t.after(async () => {
    if (previousValue === undefined) {
      delete process.env.SPORTSDATAIO_API_KEY;
    } else {
      process.env.SPORTSDATAIO_API_KEY = previousValue;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  delete process.env.SPORTSDATAIO_API_KEY;
  await fs.writeFile(blockingFile, "not a directory", "utf8");

  await assert.rejects(
    saveProviderApiKey({
      providerId: "sportsdataio",
      envKey: "SPORTSDATAIO_API_KEY",
      apiKey: "sportsdataio-valid-test-key"
    }, {
      rootDir: tempDir,
      envPath: path.join(blockingFile, ".env.local")
    }),
    /ENOTDIR|not a directory/i
  );

  assert.equal(process.env.SPORTSDATAIO_API_KEY, undefined);
});

test("a failed live verification cannot echo a newly submitted provider key", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-provider-redaction-"));
  const apiKey = "newly-submitted-provider-secret";
  const previousValue = process.env.THE_ODDS_API_KEY;
  t.after(async () => {
    if (previousValue === undefined) {
      delete process.env.THE_ODDS_API_KEY;
    } else {
      process.env.THE_ODDS_API_KEY = previousValue;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  delete process.env.THE_ODDS_API_KEY;

  await assert.rejects(
    saveProviderApiKey({
      providerId: "the-odds-api",
      envKey: "THE_ODDS_API_KEY",
      apiKey
    }, {
      rootDir: tempDir,
      envPath: path.join(tempDir, ".env.local"),
      fetchJsonImpl: async () => {
        throw new Error(`Provider rejected credential ${apiKey}.`);
      }
    }),
    (error) => {
      const message = error instanceof Error ? error.message : String(error);

      assert.equal(message.includes(apiKey), false);
      assert.match(message, /\[REDACTED\]/);
      return true;
    }
  );
});
