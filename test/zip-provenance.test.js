const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const {
  ZipProvenanceError,
  parseOrdinaryZip,
  verifyRetrosheetZipProvenance
} = require("../src/historical/zip-provenance.js");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function crc32(buffer) {
  const table = new Uint32Array(256);

  for (let value = 0; value < 256; value += 1) {
    let remainder = value;

    for (let bit = 0; bit < 8; bit += 1) {
      remainder = (remainder & 1)
        ? (0xedb88320 ^ (remainder >>> 1))
        : (remainder >>> 1);
    }
    table[value] = remainder >>> 0;
  }

  let remainder = 0xffffffff;

  for (const byte of buffer) {
    remainder = table[(remainder ^ byte) & 0xff] ^ (remainder >>> 8);
  }

  return (remainder ^ 0xffffffff) >>> 0;
}

function zipFixture(memberSpecs, options = {}) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;

  for (const spec of memberSpecs) {
    const name = Buffer.from(spec.name, "utf8");
    const content = Buffer.from(spec.content);
    const method = spec.method ?? 8;
    const descriptor = Boolean(spec.descriptor);
    const descriptorSignature = spec.descriptorSignature !== false;
    const flags = (spec.flags ?? 0) | (descriptor ? 0x0008 : 0);
    let compressed = method === 8
      ? zlib.deflateRawSync(content)
      : Buffer.from(content);

    if (spec.trailingCompressedBytes) {
      compressed = Buffer.concat([
        compressed,
        Buffer.from(spec.trailingCompressedBytes)
      ]);
    }

    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(descriptor ? 0 : checksum, 14);
    local.writeUInt32LE(descriptor ? 0 : compressed.length, 18);
    local.writeUInt32LE(descriptor ? 0 : content.length, 22);
    local.writeUInt16LE(name.length, 26);

    let dataDescriptor = Buffer.alloc(0);

    if (descriptor) {
      dataDescriptor = Buffer.alloc(descriptorSignature ? 16 : 12);
      const start = descriptorSignature ? 4 : 0;

      if (descriptorSignature) {
        dataDescriptor.writeUInt32LE(0x08074b50, 0);
      }
      dataDescriptor.writeUInt32LE(checksum, start);
      dataDescriptor.writeUInt32LE(compressed.length, start + 4);
      dataDescriptor.writeUInt32LE(content.length, start + 8);
    }

    localRecords.push(Buffer.concat([local, name, compressed, dataDescriptor]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralRecords.push(Buffer.concat([central, name]));
    localOffset += localRecords.at(-1).length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const comment = Buffer.from(options.comment ?? "");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(memberSpecs.length, 8);
  end.writeUInt16LE(memberSpecs.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(comment.length, 20);

  return Buffer.concat([...localRecords, centralDirectory, end, comment]);
}

function requiredMembers(options = {}) {
  return [
    {
      name: options.gameinfoName ?? "2025gameinfo.csv",
      content: options.gameinfo ?? "gid,date\nA,20250401\n",
      method: 0
    },
    {
      name: options.battingName ?? "2025batting.csv",
      content: options.batting ?? "gid,id,b_h\nA,bear01,2\n",
      method: 8,
      descriptor: true
    },
    {
      name: options.pitchingName ?? "2025pitching.csv",
      content: options.pitching ?? "gid,id,p_k\nA,bear02,7\n",
      method: 8,
      descriptor: true,
      descriptorSignature: false
    }
  ];
}

function verifyFixture(memberSpecs, overrides = {}) {
  const archiveBuffer = zipFixture(memberSpecs);
  const byName = new Map(memberSpecs.map((member) => [
    member.name,
    Buffer.from(member.content)
  ]));

  return verifyRetrosheetZipProvenance({
    archiveBuffer,
    gameinfoBuffer: byName.get("2025gameinfo.csv"),
    battingBuffer: byName.get("2025batting.csv"),
    pitchingBuffer: byName.get("2025pitching.csv"),
    ...overrides
  });
}

test("verifies stored and deflated Retrosheet members byte-for-byte", () => {
  const members = [
    ...requiredMembers(),
    {
      name: "2025allplayers.csv",
      content: "id,last,first\nbear01,Bear,Benny\n",
      method: 8
    },
    {
      name: "2025plays.csv",
      content: "unrelated archive member",
      method: 8
    }
  ];
  const archiveBuffer = zipFixture(members);
  const result = verifyRetrosheetZipProvenance({
    archiveBuffer,
    gameinfoBuffer: Buffer.from(members[0].content),
    battingBuffer: Buffer.from(members[1].content),
    pitchingBuffer: Buffer.from(members[2].content),
    playersBuffer: Buffer.from(members[3].content)
  });

  assert.equal(result.season, "2025");
  assert.equal(result.archiveSha256, sha256(archiveBuffer));
  assert.deepEqual(Object.keys(result.members), [
    "gameinfo",
    "batting",
    "pitching",
    "players"
  ]);
  assert.deepEqual(result.members.gameinfo, {
    memberName: "2025gameinfo.csv",
    sha256: sha256(Buffer.from(members[0].content)),
    compressionMethod: "stored",
    bytes: Buffer.byteLength(members[0].content)
  });
  assert.equal(result.members.batting.compressionMethod, "deflate");
  assert.equal(result.members.players.memberName, "2025allplayers.csv");
  assert.equal(parseOrdinaryZip(archiveBuffer).length, 5);
});

test("does not require allplayers when no players buffer is supplied", () => {
  const result = verifyFixture(requiredMembers());

  assert.equal(result.season, "2025");
  assert.deepEqual(Object.keys(result.members), [
    "gameinfo",
    "batting",
    "pitching"
  ]);
});

test("rejects supplied bytes that do not exactly equal the ZIP member", () => {
  assert.throws(
    () => verifyFixture(requiredMembers(), {
      battingBuffer: Buffer.from("different bytes")
    }),
    (error) => (
      error instanceof ZipProvenanceError
      && error.code === "CONTENT_MISMATCH"
    )
  );
});

test("rejects missing, duplicate, and mixed-season Retrosheet members", () => {
  assert.throws(
    () => verifyRetrosheetZipProvenance({
      archiveBuffer: zipFixture(requiredMembers().slice(0, 2)),
      gameinfoBuffer: Buffer.from(requiredMembers()[0].content),
      battingBuffer: Buffer.from(requiredMembers()[1].content),
      pitchingBuffer: Buffer.from("missing")
    }),
    (error) => error instanceof ZipProvenanceError && error.code === "MISSING_MEMBER"
  );

  assert.throws(
    () => verifyRetrosheetZipProvenance({
      archiveBuffer: zipFixture([
        ...requiredMembers(),
        {
          name: "2024gameinfo.csv",
          content: "other season",
          method: 0
        }
      ]),
      gameinfoBuffer: Buffer.from(requiredMembers()[0].content),
      battingBuffer: Buffer.from(requiredMembers()[1].content),
      pitchingBuffer: Buffer.from(requiredMembers()[2].content)
    }),
    (error) => (
      error instanceof ZipProvenanceError
      && error.code === "AMBIGUOUS_SEASON_MEMBER"
    )
  );

  const mixed = requiredMembers({
    pitchingName: "2024pitching.csv"
  });

  assert.throws(
    () => verifyRetrosheetZipProvenance({
      archiveBuffer: zipFixture(mixed),
      gameinfoBuffer: Buffer.from(mixed[0].content),
      battingBuffer: Buffer.from(mixed[1].content),
      pitchingBuffer: Buffer.from(mixed[2].content)
    }),
    (error) => error instanceof ZipProvenanceError && error.code === "MIXED_SEASONS"
  );
});

test("rejects duplicate and unsafe archive member names before extraction", () => {
  const duplicate = [
    ...requiredMembers(),
    {
      name: "2025BATTING.csv",
      content: "case-colliding name",
      method: 0
    }
  ];

  assert.throws(
    () => parseOrdinaryZip(zipFixture(duplicate)),
    (error) => error instanceof ZipProvenanceError && error.code === "DUPLICATE_MEMBER"
  );
  assert.throws(
    () => parseOrdinaryZip(zipFixture([
      ...requiredMembers(),
      { name: "../escape.csv", content: "unsafe", method: 0 }
    ])),
    (error) => error instanceof ZipProvenanceError && error.code === "UNSAFE_MEMBER_NAME"
  );
});

test("rejects encryption, unsupported compression, and ZIP64 markers", () => {
  const encrypted = requiredMembers();
  encrypted[1] = { ...encrypted[1], flags: 0x0001 };

  assert.throws(
    () => parseOrdinaryZip(zipFixture(encrypted)),
    (error) => (
      error instanceof ZipProvenanceError
      && error.code === "ENCRYPTION_UNSUPPORTED"
    )
  );

  const unsupported = requiredMembers();
  unsupported[0] = { ...unsupported[0], method: 12 };

  assert.throws(
    () => parseOrdinaryZip(zipFixture(unsupported)),
    (error) => (
      error instanceof ZipProvenanceError
      && error.code === "UNSUPPORTED_COMPRESSION"
    )
  );

  const zip64Marker = zipFixture(requiredMembers());
  const endOffset = zip64Marker.length - 22;
  zip64Marker.writeUInt32LE(0xffffffff, endOffset + 12);

  assert.throws(
    () => parseOrdinaryZip(zip64Marker),
    (error) => error instanceof ZipProvenanceError && error.code === "ZIP64_UNSUPPORTED"
  );
});

test("rejects trailing deflate bytes and invalid data descriptors", () => {
  const trailing = requiredMembers();
  trailing[1] = {
    ...trailing[1],
    trailingCompressedBytes: [0x00, 0x01]
  };

  assert.throws(
    () => verifyFixture(trailing),
    (error) => (
      error instanceof ZipProvenanceError
      && error.code === "AMBIGUOUS_COMPRESSED_DATA"
    )
  );

  const invalidDescriptor = zipFixture(requiredMembers());
  const firstEntryLength = (
    30
    + Buffer.byteLength(requiredMembers()[0].name)
    + Buffer.byteLength(requiredMembers()[0].content)
  );
  const batting = requiredMembers()[1];
  const battingCompressedLength = zlib.deflateRawSync(
    Buffer.from(batting.content)
  ).length;
  const descriptorOffset = (
    firstEntryLength
    + 30
    + Buffer.byteLength(batting.name)
    + battingCompressedLength
  );
  invalidDescriptor.writeUInt32LE(0x12345678, descriptorOffset + 4);

  assert.throws(
    () => parseOrdinaryZip(invalidDescriptor),
    (error) => (
      error instanceof ZipProvenanceError
      && error.code === "INVALID_DATA_DESCRIPTOR"
    )
  );
});
