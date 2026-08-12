const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  main,
  parseArgs,
  sha256
} = require("../src/cli/retrosheet-backtest.js");

function crc32(buffer) {
  let remainder = 0xffffffff;

  for (const byte of buffer) {
    remainder ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      remainder = (remainder & 1)
        ? (0xedb88320 ^ (remainder >>> 1))
        : (remainder >>> 1);
    }
  }

  return (remainder ^ 0xffffffff) >>> 0;
}

function storedZip(members) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;

  for (const [nameValue, contentValue] of members) {
    const name = Buffer.from(nameValue, "ascii");
    const content = Buffer.from(contentValue);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localRecords.push(Buffer.concat([local, name, content]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralRecords.push(Buffer.concat([central, name]));
    localOffset += localRecords.at(-1).length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);

  return Buffer.concat([...localRecords, centralDirectory, end]);
}

function sourceFixture() {
  const gameinfo = ["gid,visteam,hometeam,site,date,number,suspend,gametype,box,season"];
  const batting = [
    "gid,id,team,b_seq,stattype,b_r,b_h,b_d,b_t,b_hr,date,vishome,opp,gametype,box"
  ];
  const pitching = [
    "gid,id,team,p_seq,stattype,p_k,p_gs,date,vishome,opp,gametype,box"
  ];

  for (let day = 1; day <= 3; day += 1) {
    const date = `2025040${day}`;
    const gameId = `HOM${date}0`;
    gameinfo.push(`${gameId},VIS,HOM,SITE,${date},0,,regular,y,2025`);
    batting.push(`${gameId},batter01,HOM,1,value,1,2,1,0,0,${date},h,VIS,regular,y`);
    pitching.push(`${gameId},pitcher01,HOM,1,value,6,1,${date},h,VIS,regular,y`);
  }

  const fixture = {
    gameinfo: Buffer.from(`${gameinfo.join("\n")}\n`),
    batting: Buffer.from(`${batting.join("\n")}\n`),
    pitching: Buffer.from(`${pitching.join("\n")}\n`),
    players: Buffer.from("id,last,first\nbatter01,Bear,Benny\npitcher01,Bear,Paula\n")
  };

  return {
    bundle: storedZip([
      ["2025gameinfo.csv", fixture.gameinfo],
      ["2025batting.csv", fixture.batting],
      ["2025pitching.csv", fixture.pitching],
      ["2025allplayers.csv", fixture.players]
    ]),
    ...fixture
  };
}

async function writeSources(tempDir) {
  const fixture = sourceFixture();
  const paths = {};

  for (const [name, bytes] of Object.entries(fixture)) {
    const extension = name === "bundle" ? "zip" : "csv";
    const filePath = path.join(tempDir, `${name}.${extension}`);
    await fs.writeFile(filePath, bytes);
    paths[name] = filePath;
  }

  return { fixture, paths };
}

function args(paths, outputDir, dryRun = false) {
  return [
    "--season", "2025",
    "--bundle", paths.bundle,
    "--gameinfo", paths.gameinfo,
    "--batting", paths.batting,
    "--pitching", paths.pitching,
    "--players", paths.players,
    "--output-dir", outputDir,
    "--min-history", "2",
    "--recent-limit", "2",
    "--generated-at", "2026-07-29T18:45:00.000Z",
    "--source-url", "https://www.retrosheet.org/test.zip",
    ...(dryRun ? ["--dry-run"] : [])
  ];
}

test("CLI requires local Retrosheet bundle and extracted source files", () => {
  assert.throws(() => parseArgs([]), /--season is required/);
  assert.throws(
    () => parseArgs(["--season", "2025", "--bundle", "season.zip"]),
    /--gameinfo is required/
  );
  assert.throws(
    () => parseArgs([
      "--season", "2025",
      "--bundle", "season.zip",
      "--gameinfo", "game.csv",
      "--batting", "bat.csv",
      "--pitching", "pitch.csv",
      "--output-dir", "out",
      "--download"
    ]),
    /Unknown argument/
  );
});

test("dry run reconstructs real rows but writes nothing", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "retrosheet-cli-dry-"));
  const { paths } = await writeSources(tempDir);
  const outputDir = path.join(tempDir, "output");
  const output = [];
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const code = await main(args(paths, outputDir, true), {
    writeOutput: (value) => output.push(value),
    writeError: (value) => output.push(`ERROR:${value}`)
  });
  const summary = JSON.parse(output.at(-1));

  assert.equal(code, 0);
  assert.equal(summary.status, "dry_run");
  assert.equal(summary.mode, "historical_reconstruction");
  assert.equal(summary.season, 2025);
  assert.equal(summary.archiveBindingStatus, "verified_archive_member_bytes");
  assert.equal(summary.prospective, false);
  assert.equal(summary.promotionEligible, false);
  assert.equal(summary.betAuthorization, false);
  assert.equal(summary.observations, 4);
  assert.equal(summary.distinctEvents, 1);
  assert.equal(summary.recordsPath, null);
  assert.equal(summary.manifestPath, null);
  await assert.rejects(
    fs.access(outputDir),
    (error) => error instanceof Error && Reflect.get(error, "code") === "ENOENT"
  );
});

test("write mode retains append-only JSONL plus a manifest with exact source and artifact digests", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "retrosheet-cli-write-"));
  const { fixture, paths } = await writeSources(tempDir);
  const outputDir = path.join(tempDir, "output");
  const output = [];
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const code = await main(args(paths, outputDir), {
    writeOutput: (value) => output.push(value),
    writeError: (value) => output.push(`ERROR:${value}`)
  });
  const summary = JSON.parse(output.at(-1));
  const recordsBytes = await fs.readFile(summary.recordsPath);
  const manifest = JSON.parse(await fs.readFile(summary.manifestPath, "utf8"));
  const records = recordsBytes
    .toString("utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(code, 0);
  assert.equal(summary.status, "written");
  assert.equal(records.length, 4);
  assert.equal(sha256(recordsBytes), summary.artifactDigest);
  assert.equal(manifest.output.artifactDigest, summary.artifactDigest);
  assert.equal(manifest.output.records, 4);
  assert.equal(manifest.source.sourceDigests.bundle, sha256(fixture.bundle));
  assert.equal(manifest.source.sourceDigests.batting, sha256(fixture.batting));
  assert.equal(manifest.source.sourceDigests.pitching, sha256(fixture.pitching));
  assert.equal(manifest.source.archiveBinding.status, "verified_archive_member_bytes");
  assert.equal(
    manifest.source.archiveBinding.members.gameinfo.memberName,
    "2025gameinfo.csv"
  );
  assert.equal(manifest.prospective, false);
  assert.equal(manifest.promotionEligible, false);
  assert.ok(manifest.source.attribution.includes("Retrosheet"));
  assert.ok(records.every((record) => record.prospective === false));

  const repeated = [];
  const repeatedCode = await main(args(paths, outputDir), {
    writeOutput: (value) => repeated.push(value),
    writeError: (value) => repeated.push(`ERROR:${value}`)
  });

  assert.equal(repeatedCode, 1);
  assert.match(repeated.at(-1), /Refusing to overwrite existing backtest artifact/);
  assert.equal(
    (await fs.readFile(summary.recordsPath, "utf8")).trim().split("\n").length,
    4
  );
});

test("CLI rejects a season mismatch or extracted bytes that are not from the ZIP", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "retrosheet-cli-bind-"));
  const { paths } = await writeSources(tempDir);
  const outputDir = path.join(tempDir, "output");
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const wrongSeasonOutput = [];
  const wrongSeasonArgs = args(paths, outputDir, true);
  wrongSeasonArgs[1] = "2024";
  const wrongSeasonCode = await main(wrongSeasonArgs, {
    writeOutput: (value) => wrongSeasonOutput.push(value),
    writeError: (value) => wrongSeasonOutput.push(`ERROR:${value}`)
  });

  assert.equal(wrongSeasonCode, 1);
  assert.match(wrongSeasonOutput.at(-1), /declare season 2025; expected 2024/);

  await fs.appendFile(paths.batting, "\n");
  const mismatchOutput = [];
  const mismatchCode = await main(args(paths, outputDir, true), {
    writeOutput: (value) => mismatchOutput.push(value),
    writeError: (value) => mismatchOutput.push(`ERROR:${value}`)
  });

  assert.equal(mismatchCode, 1);
  assert.match(mismatchOutput.at(-1), /do not match ZIP member/);
});
