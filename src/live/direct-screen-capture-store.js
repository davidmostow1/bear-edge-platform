const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_LEDGER_PATH = path.resolve(
  process.cwd(),
  "data/evidence/direct_screen_captures.jsonl"
);
const DEFAULT_ARTIFACT_DIR = path.resolve(
  process.cwd(),
  "data/evidence/direct-screen-captures"
);
const appendQueues = new Map();

function resolvePaths(options = {}) {
  return {
    ledgerPath: path.resolve(options.ledgerPath ?? DEFAULT_LEDGER_PATH),
    artifactDir: path.resolve(options.artifactDir ?? DEFAULT_ARTIFACT_DIR)
  };
}

function sha256(buffer) {
  return `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
}

function expectedCaptureId(captureDigest) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(captureDigest ?? ""))) {
    throw new Error("Capture evidence must contain a full SHA-256 captureDigest.");
  }

  return `dsc_${captureDigest.slice("sha256:".length, "sha256:".length + 24)}`;
}

function enqueueAppend(ledgerPath, operation) {
  const prior = appendQueues.get(ledgerPath) ?? Promise.resolve();
  const run = prior.then(operation, operation);
  const tail = run.catch(() => {});

  appendQueues.set(ledgerPath, tail);

  return run.finally(() => {
    if (appendQueues.get(ledgerPath) === tail) {
      appendQueues.delete(ledgerPath);
    }
  });
}

async function inspectLedger(ledgerPath, fsImpl = fs) {
  let contents;

  try {
    contents = await fsImpl.readFile(ledgerPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        records: [],
        malformedLines: []
      };
    }

    throw error;
  }

  const records = [];
  const malformedLines = [];

  contents.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) {
      return;
    }

    try {
      const record = JSON.parse(line);

      if (!record || typeof record !== "object" || Array.isArray(record)
        || typeof record.captureId !== "string"
        || typeof record.capturedAt !== "string"
        || typeof record.evidence?.captureDigest !== "string") {
        throw new Error("Line is not a direct-screen capture envelope.");
      }
      if (record.captureId !== expectedCaptureId(record.evidence.captureDigest)) {
        throw new Error("Line captureId does not match its full capture digest.");
      }

      records.push(record);
    } catch (error) {
      malformedLines.push({
        lineNumber: index + 1,
        error: error instanceof Error ? error.message : "Malformed capture line."
      });
    }
  });

  return {
    records,
    malformedLines
  };
}

async function retainArtifact(capture, image, artifactDir, fsImpl = fs) {
  if (!Buffer.isBuffer(image?.buffer) || !image.extension) {
    throw new Error("A validated decoded screenshot is required for persistence.");
  }

  const computedDigest = sha256(image.buffer);

  if (computedDigest !== capture.evidence?.screenshotSha256) {
    throw new Error("Decoded screenshot bytes do not match the capture digest.");
  }

  const digestName = computedDigest.slice("sha256:".length);
  const artifactPath = path.join(artifactDir, `${digestName}${image.extension}`);

  await fsImpl.mkdir(artifactDir, { recursive: true, mode: 0o700 });

  try {
    await fsImpl.writeFile(artifactPath, image.buffer, {
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }

    const retained = await fsImpl.readFile(artifactPath);

    if (sha256(retained) !== computedDigest) {
      throw new Error("The digest-addressed screenshot path contains different bytes.");
    }
  }

  return artifactPath;
}

async function retainVisibleTextArtifact(capture, image, artifactDir, fsImpl = fs) {
  if (typeof image?.visibleText !== "string" || !image.visibleText) {
    throw new Error("Validated visible page text is required for persistence.");
  }

  const bytes = Buffer.from(image.visibleText, "utf8");
  const computedDigest = sha256(bytes);

  if (computedDigest !== capture.evidence?.visibleTextSha256) {
    throw new Error("Visible page text does not match the capture digest.");
  }

  const digestName = computedDigest.slice("sha256:".length);
  const artifactPath = path.join(artifactDir, `${digestName}.txt`);

  await fsImpl.mkdir(artifactDir, { recursive: true, mode: 0o700 });

  try {
    await fsImpl.writeFile(artifactPath, bytes, {
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }

    const retained = await fsImpl.readFile(artifactPath);

    if (sha256(retained) !== computedDigest) {
      throw new Error("The digest-addressed visible-text path contains different bytes.");
    }
  }

  return artifactPath;
}

async function appendDurably(ledgerPath, record, fsImpl = fs) {
  await fsImpl.mkdir(path.dirname(ledgerPath), { recursive: true, mode: 0o700 });

  const handle = await fsImpl.open(ledgerPath, "a", 0o600);

  try {
    const line = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
    const { bytesWritten } = await handle.write(line, 0, line.length, null);

    if (bytesWritten !== line.length) {
      throw new Error("Direct-screen capture ledger append was incomplete.");
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function persistDirectScreenCapture(capture, image, options = {}) {
  const { ledgerPath, artifactDir } = resolvePaths(options);
  const fsImpl = options.fsImpl ?? fs;

  if (capture?.captureId !== expectedCaptureId(capture?.evidence?.captureDigest)) {
    throw new Error("captureId does not match the full capture digest.");
  }

  return enqueueAppend(ledgerPath, async () => {
    const inspection = await inspectLedger(ledgerPath, fsImpl);

    if (inspection.malformedLines.length > 0) {
      throw new Error(
        `Direct-screen capture writes are blocked by ${inspection.malformedLines.length} malformed retained line(s).`
      );
    }

    const sameDigest = inspection.records.find(
      (record) => record.evidence.captureDigest === capture.evidence.captureDigest
    );
    const sameId = inspection.records.find((record) => record.captureId === capture.captureId);

    if (sameId && sameId.evidence.captureDigest !== capture.evidence?.captureDigest) {
      throw new Error(`Capture ${capture.captureId} already exists with a different content digest.`);
    }
    if (sameDigest && sameDigest.captureId !== capture.captureId) {
      throw new Error("An existing capture digest is bound to a different captureId.");
    }

    const artifactPath = await retainArtifact(capture, image, artifactDir, fsImpl);
    const visibleTextArtifactPath = await retainVisibleTextArtifact(
      capture,
      image,
      artifactDir,
      fsImpl
    );

    if (sameDigest) {
      return {
        record: sameDigest,
        artifactPath,
        visibleTextArtifactPath,
        ledgerPath,
        idempotent: true,
        persistedAt: sameDigest.persistedAt ?? null
      };
    }

    const screenshotArtifact = path
      .relative(path.dirname(ledgerPath), artifactPath)
      .split(path.sep)
      .join("/");
    const visibleTextArtifact = path
      .relative(path.dirname(ledgerPath), visibleTextArtifactPath)
      .split(path.sep)
      .join("/");
    const persistedAt = (options.now instanceof Date ? options.now : new Date()).toISOString();
    const record = {
      ...capture,
      evidence: {
        ...capture.evidence,
        screenshotArtifact,
        visibleTextArtifact
      },
      persistedAt
    };

    await appendDurably(ledgerPath, record, fsImpl);

    return {
      record,
      artifactPath,
      visibleTextArtifactPath,
      ledgerPath,
      idempotent: false,
      persistedAt
    };
  });
}

async function readLatestDirectScreenCapture(options = {}) {
  const { ledgerPath } = resolvePaths(options);
  const inspection = await inspectLedger(ledgerPath, options.fsImpl ?? fs);
  const sorted = [...inspection.records].sort(
    (left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt)
  );

  return {
    ledgerPath,
    latest: sorted[0] ?? null,
    summary: {
      records: inspection.records.length,
      malformedLines: inspection.malformedLines.length
    },
    malformedLines: inspection.malformedLines
  };
}

module.exports = {
  persistDirectScreenCapture,
  readLatestDirectScreenCapture
};
