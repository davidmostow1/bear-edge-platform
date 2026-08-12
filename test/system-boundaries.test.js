const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_MANIFEST_PATH,
  auditRepositoryBoundaries,
  validateBoundaryManifest
} = require("../governance/system-boundaries.js");

function trackedManifest() {
  return JSON.parse(fs.readFileSync(DEFAULT_MANIFEST_PATH, "utf8"));
}

/**
 * @param {(repoRoot: string) => void} operation
 */
function withFixture(operation) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bear-edge-boundaries-"));

  try {
    fs.mkdirSync(path.join(repoRoot, "governance"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "models"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "src", "dashboard"), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ name: "betting-decision-engine" })
    );
    fs.writeFileSync(
      path.join(repoRoot, "governance", "system-boundaries.json"),
      JSON.stringify(trackedManifest())
    );
    fs.writeFileSync(
      path.join(repoRoot, "models", "registry.json"),
      JSON.stringify({
        models: [{
          modelId: "poisson_count_v1",
          modelVersion: "1.0.0",
          marketFamily: "batter_hits",
          modelStatus: "research_only",
          dataSources: ["official_mlb_statsapi"]
        }]
      })
    );
    fs.writeFileSync(
      path.join(repoRoot, "src", "dashboard", "app.js"),
      'const storageKeys = { bankroll: "bearEdge.bankroll" };\n'
    );
    fs.writeFileSync(path.join(repoRoot, "src", "index.js"), "module.exports = {};\n");

    operation(repoRoot);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
}

test("tracked system-boundary manifest validates", () => {
  const manifest = trackedManifest();
  assert.equal(validateBoundaryManifest(manifest), manifest);
});

test("fixed authorization and evidence boundaries cannot be weakened", () => {
  for (const [field, value] of [
    ["defaultAuthorization", "BET_ALLOWED"],
    ["predictiveImprovement", "ESTABLISHED"],
    ["modelValidation", "VALIDATED"],
    ["wageringAuthority", "EXPANDED"]
  ]) {
    const manifest = trackedManifest();
    manifest[field] = value;
    assert.throws(
      () => validateBoundaryManifest(manifest),
      /must remain/
    );
  }
});

test("ownership and scan paths reject Windows drive-letter paths", () => {
  for (const mutation of [
    (manifest) => {
      manifest.lanes[0].modelRegistry = "C:/outside/models.json";
    },
    (manifest) => {
      manifest.bearEdgeProductionProhibitions.scanRoots = ["D:/outside/src"];
    }
  ]) {
    const manifest = trackedManifest();
    mutation(manifest);
    assert.throws(
      () => validateBoundaryManifest(manifest),
      /must be a normalized repository-relative path|must continue to include src/
    );
  }
});

test("external lanes cannot own Bear Edge ledgers, models, or bankrolls", () => {
  for (const mutation of [
    (manifest) => {
      manifest.lanes.find(
        (lane) => lane.laneId === "sweet_bear_draftkings_predictions"
      ).ledgerRoots = ["data/logs"];
    },
    (manifest) => {
      manifest.lanes.find(
        (lane) => lane.laneId === "sweet_bear_draftkings_predictions"
      ).modelRegistry = "models/registry.json";
    },
    (manifest) => {
      manifest.lanes.find(
        (lane) => lane.laneId === "sweet_bear_kalshi"
      ).bankrollStorageKeys = ["bearEdge.bankroll"];
    }
  ]) {
    const manifest = trackedManifest();
    mutation(manifest);
    assert.throws(
      () => validateBoundaryManifest(manifest),
      /must not own or write|owned by both/
    );
  }
});

test("lane import modes cannot grant a writable or broader import", () => {
  for (const laneId of [
    "bear_edge_core",
    "sweet_bear_draftkings_predictions",
    "sweet_bear_kalshi"
  ]) {
    const manifest = trackedManifest();
    manifest.lanes.find((lane) => lane.laneId === laneId).allowedImportMode = "full_write";
    assert.throws(
      () => validateBoundaryManifest(manifest),
      /ownership does not match|allowedImportMode must remain/
    );
  }
});

test("unknown manifest fields and weakened production scanning fail closed", () => {
  for (const mutation of [
    (manifest) => {
      manifest.lanes.find(
        (lane) => lane.laneId === "sweet_bear_kalshi"
      ).ledgerRootsAlt = ["data/other"];
    },
    (manifest) => {
      manifest.bearEdgeProductionProhibitions.sourceTokens = [];
    },
    (manifest) => {
      manifest.bearEdgeProductionProhibitions.scanRoots = ["src/dashboard"];
    }
  ]) {
    const manifest = trackedManifest();
    mutation(manifest);
    assert.throws(
      () => validateBoundaryManifest(manifest),
      /unsupported fields|must continue/
    );
  }
});

test("cross-lane writes, bankroll reads, promotion, and authority transfer fail closed", () => {
  for (const field of [
    "allowLedgerWrites",
    "allowBankrollReads",
    "allowModelPromotion",
    "allowAuthorizationTransfer"
  ]) {
    const manifest = trackedManifest();
    manifest.crossLaneRules[field] = true;
    assert.throws(
      () => validateBoundaryManifest(manifest),
      new RegExp(`${field} must remain false`)
    );
  }
});

test("DraftKings Predictions cannot become sportsbook odds or wager authority", () => {
  const manifest = trackedManifest();
  manifest.bearEdgeProductionProhibitions.allowContractPriceAsSportsbookAmericanOdds = true;
  assert.throws(
    () => validateBoundaryManifest(manifest),
    /separate from sportsbook odds math/
  );

  const second = trackedManifest();
  second.lanes.find(
    (lane) => lane.laneId === "sweet_bear_draftkings_predictions"
  ).mayAuthorizeWagers = true;
  assert.throws(
    () => validateBoundaryManifest(second),
    /must not authorize wagers/
  );
});

test("repository audit accepts the isolated research-only fixture", () => {
  withFixture((repoRoot) => {
    const result = auditRepositoryBoundaries({ repoRoot });
    assert.equal(result.status, "PASS");
    assert.equal(result.modelCount, 1);
    assert.equal(result.researchOnlyModelCount, 1);
    assert.equal(result.authorization, "PRICE_CHECK_ONLY");
  });
});

test("repository audit identifies and passes the real checkout", () => {
  const result = auditRepositoryBoundaries();
  assert.equal(result.status, "PASS");
  assert.equal(result.repoRoot, fs.realpathSync(path.resolve(__dirname, "..")));
  assert.match(result.manifestDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.modelCount, 5);
  assert.equal(result.researchOnlyModelCount, 5);
  assert.equal(result.authorization, "PRICE_CHECK_ONLY");
});

test("repository audit fails closed when the declared scan root is absent", () => {
  withFixture((repoRoot) => {
    fs.rmSync(path.join(repoRoot, "src"), { recursive: true, force: true });
    assert.throws(
      () => auditRepositoryBoundaries({ repoRoot }),
      /must be an existing, non-symlinked directory/
    );
  });
});

test("repository audit rejects a wrong package and an empty model registry", () => {
  for (const mutation of [
    (repoRoot) => {
      fs.writeFileSync(
        path.join(repoRoot, "package.json"),
        JSON.stringify({ name: "different-system" })
      );
    },
    (repoRoot) => {
      fs.writeFileSync(
        path.join(repoRoot, "models", "registry.json"),
        JSON.stringify({ models: [] })
      );
    }
  ]) {
    withFixture((repoRoot) => {
      mutation(repoRoot);
      assert.throws(
        () => auditRepositoryBoundaries({ repoRoot }),
        /does not match the boundary manifest|must not be empty/
      );
    });
  }
});

test("repository audit rejects symlinks inside the production scan surface", () => {
  withFixture((repoRoot) => {
    fs.symlinkSync(
      path.join(repoRoot, "src", "index.js"),
      path.join(repoRoot, "src", "linked.js")
    );
    assert.throws(
      () => auditRepositoryBoundaries({ repoRoot }),
      /is a symlink inside the production scan surface/
    );
  });
});

test("repository audit rejects Kalshi production integration in executable source extensions", () => {
  for (const extension of ["cjs", "js", "jsx", "mjs", "ts", "tsx"]) {
    withFixture((repoRoot) => {
      fs.writeFileSync(
        path.join(repoRoot, "src", `venue.${extension}`),
        'const provider = "kalshi";\n'
      );
      assert.throws(
        () => auditRepositoryBoundaries({ repoRoot }),
        /contains prohibited production token kalshi/
      );
    });
  }
});

test("repository audit rejects Bear Edge model promotion or cross-lane identity", () => {
  for (const modelPatch of [
    { modelStatus: "validated" },
    { modelId: "sweet_bear_batter_v1" },
    { trainingCutoff: "sweet_bear_2026-07-30" },
    {
      calculationImplementation: {
        implementationDigest: "fixture-digest",
        modules: ["src/kalshi-model.js"]
      }
    },
    { calibrationReportDigest: "sweet_bear_report_digest" }
  ]) {
    withFixture((repoRoot) => {
      const registryPath = path.join(repoRoot, "models", "registry.json");
      const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
      Object.assign(registry.models[0], modelPatch);
      fs.writeFileSync(registryPath, JSON.stringify(registry));
      assert.throws(
        () => auditRepositoryBoundaries({ repoRoot }),
        /must remain research_only|Sweet Bear or Kalshi model identity/
      );
    });
  }
});

test("repository audit rejects a shared or renamed bankroll namespace", () => {
  withFixture((repoRoot) => {
    fs.writeFileSync(
      path.join(repoRoot, "src", "dashboard", "app.js"),
      'const storageKeys = { bankroll: "sweetBear.bankroll" };\n'
    );
    assert.throws(
      () => auditRepositoryBoundaries({ repoRoot }),
      /exclusively namespaced to Bear Edge/
    );
  });
});

test("repository audit rejects any second bankroll storage literal outside the dashboard", () => {
  for (const source of [
    'export const bankrollKey = "sweetBear.bankroll";\n',
    'export const bankrollKey = "sweetBear.bankrollCents";\n',
    'export const bankrollKey = "rogueSystem.bankroll";\n',
    'export const bankrollKey = "stake.bankroll";\n',
    "export const bankrollKey = `rogueSystem.bankroll`;\n"
  ]) {
    withFixture((repoRoot) => {
      fs.mkdirSync(path.join(repoRoot, "src", "config"), { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, "src", "config", "storage.mjs"),
        source
      );
      assert.throws(
        () => auditRepositoryBoundaries({ repoRoot }),
        /exclusively namespaced to Bear Edge/
      );
    });
  }
});
