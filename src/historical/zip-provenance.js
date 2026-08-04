const crypto = require("node:crypto");
const { TextDecoder } = require("node:util");
const zlib = require("node:zlib");

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP64_EXTRA_ID = 0x0001;
const UNICODE_PATH_EXTRA_ID = 0x7075;
const AES_EXTRA_ID = 0x9901;
const MAX_EOCD_COMMENT_BYTES = 0xffff;
const MAX_VERIFIED_MEMBER_BYTES = 512 * 1024 * 1024;
const ENCRYPTION_FLAGS = 0x0001 | 0x0040 | 0x2000;
const COMMON_FLAGS = 0x0008 | 0x0800;
const DEFLATE_FLAGS = 0x0002 | 0x0004;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

const RETROSHEET_MEMBER_SPECS = Object.freeze([
  Object.freeze({
    key: "gameinfo",
    bufferKey: "gameinfoBuffer",
    suffix: "gameinfo.csv",
    required: true
  }),
  Object.freeze({
    key: "batting",
    bufferKey: "battingBuffer",
    suffix: "batting.csv",
    required: true
  }),
  Object.freeze({
    key: "pitching",
    bufferKey: "pitchingBuffer",
    suffix: "pitching.csv",
    required: true
  }),
  Object.freeze({
    key: "players",
    bufferKey: "playersBuffer",
    suffix: "allplayers.csv",
    required: false
  })
]);

class ZipProvenanceError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "ZipProvenanceError";
    this.code = code;
  }
}

function fail(code, message, cause = null) {
  throw new ZipProvenanceError(
    code,
    message,
    cause ? { cause } : undefined
  );
}

function requireRange(buffer, offset, length, label) {
  if (
    !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(length)
    || offset < 0
    || length < 0
    || offset + length > buffer.length
  ) {
    fail("TRUNCATED_ARCHIVE", `${label} extends outside the ZIP archive.`);
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

let crc32Table = null;

function crc32(buffer) {
  if (!crc32Table) {
    crc32Table = new Uint32Array(256);

    for (let value = 0; value < 256; value += 1) {
      let remainder = value;

      for (let bit = 0; bit < 8; bit += 1) {
        remainder = (remainder & 1)
          ? (0xedb88320 ^ (remainder >>> 1))
          : (remainder >>> 1);
      }
      crc32Table[value] = remainder >>> 0;
    }
  }

  let remainder = 0xffffffff;

  for (const byte of buffer) {
    remainder = crc32Table[(remainder ^ byte) & 0xff] ^ (remainder >>> 8);
  }

  return (remainder ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer) {
  if (buffer.length < 22) {
    fail("INVALID_ZIP", "The input is too short to contain a ZIP end record.");
  }

  const minimumOffset = Math.max(
    0,
    buffer.length - 22 - MAX_EOCD_COMMENT_BYTES
  );
  const candidates = [];

  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== EOCD_SIGNATURE) {
      continue;
    }

    const commentLength = buffer.readUInt16LE(offset + 20);

    if (offset + 22 + commentLength === buffer.length) {
      candidates.push(offset);
    }
  }

  if (candidates.length === 0) {
    fail("INVALID_ZIP", "No complete ZIP end-of-central-directory record was found.");
  }
  if (candidates.length !== 1) {
    fail(
      "AMBIGUOUS_ZIP",
      "The archive contains multiple plausible end-of-central-directory records."
    );
  }

  const offset = candidates[0];
  const diskNumber = buffer.readUInt16LE(offset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(offset + 6);
  const entriesOnDisk = buffer.readUInt16LE(offset + 8);
  const totalEntries = buffer.readUInt16LE(offset + 10);
  const centralDirectorySize = buffer.readUInt32LE(offset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(offset + 16);

  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== totalEntries) {
    fail("MULTI_DISK_UNSUPPORTED", "Multi-disk ZIP archives are not supported.");
  }
  if (
    entriesOnDisk === 0xffff
    || totalEntries === 0xffff
    || centralDirectorySize === 0xffffffff
    || centralDirectoryOffset === 0xffffffff
  ) {
    fail("ZIP64_UNSUPPORTED", "ZIP64 archives are not supported.");
  }
  if (centralDirectoryOffset + centralDirectorySize !== offset) {
    fail(
      "AMBIGUOUS_ZIP_LAYOUT",
      "The central directory is not contiguous with the ZIP end record."
    );
  }

  requireRange(
    buffer,
    centralDirectoryOffset,
    centralDirectorySize,
    "ZIP central directory"
  );

  return {
    offset,
    totalEntries,
    centralDirectoryOffset,
    centralDirectorySize
  };
}

function parseExtraFields(extra, memberName) {
  let offset = 0;

  while (offset < extra.length) {
    if (offset + 4 > extra.length) {
      fail(
        "INVALID_EXTRA_FIELD",
        `ZIP member ${memberName} has a truncated extra-field header.`
      );
    }

    const id = extra.readUInt16LE(offset);
    const length = extra.readUInt16LE(offset + 2);
    const end = offset + 4 + length;

    if (end > extra.length) {
      fail(
        "INVALID_EXTRA_FIELD",
        `ZIP member ${memberName} has a truncated extra-field value.`
      );
    }
    if (id === ZIP64_EXTRA_ID) {
      fail("ZIP64_UNSUPPORTED", `ZIP member ${memberName} uses ZIP64 metadata.`);
    }
    if (id === UNICODE_PATH_EXTRA_ID) {
      fail(
        "AMBIGUOUS_MEMBER_NAME",
        `ZIP member ${memberName} supplies an alternate Unicode path.`
      );
    }
    if (id === AES_EXTRA_ID) {
      fail("ENCRYPTION_UNSUPPORTED", `ZIP member ${memberName} uses AES metadata.`);
    }

    offset = end;
  }
}

function decodeMemberName(filenameBytes, flags) {
  if (filenameBytes.length === 0) {
    fail("UNSAFE_MEMBER_NAME", "ZIP members must have a non-empty name.");
  }

  const isAscii = filenameBytes.every((byte) => byte < 0x80);

  if (isAscii) {
    return filenameBytes.toString("ascii");
  }
  if (!(flags & 0x0800)) {
    fail(
      "UNSUPPORTED_MEMBER_ENCODING",
      "A non-ASCII ZIP member name does not declare UTF-8 encoding."
    );
  }

  try {
    return utf8Decoder.decode(filenameBytes);
  } catch (error) {
    fail(
      "UNSUPPORTED_MEMBER_ENCODING",
      "A ZIP member name is neither ASCII nor valid UTF-8.",
      error
    );
  }
}

function validateMemberName(name) {
  const segments = name.split("/");

  if (
    name.includes("\0")
    || name.includes("\\")
    || name.startsWith("/")
    || /^[A-Za-z]:/.test(name)
    || /[\u0000-\u001f\u007f]/.test(name)
    || name !== name.normalize("NFC")
  ) {
    fail("UNSAFE_MEMBER_NAME", `ZIP member ${JSON.stringify(name)} has an unsafe name.`);
  }

  const pathSegments = name.endsWith("/") ? segments.slice(0, -1) : segments;

  if (
    pathSegments.length === 0
    || pathSegments.some((segment) => (
      segment === ""
      || segment === "."
      || segment === ".."
      || /[ .]$/.test(segment)
    ))
  ) {
    fail("UNSAFE_MEMBER_NAME", `ZIP member ${JSON.stringify(name)} has an unsafe path.`);
  }
}

function validateFlags(flags, method, memberName) {
  if (flags & ENCRYPTION_FLAGS) {
    fail("ENCRYPTION_UNSUPPORTED", `ZIP member ${memberName} is encrypted.`);
  }

  const allowedFlags = COMMON_FLAGS | (method === 8 ? DEFLATE_FLAGS : 0);

  if (flags & ~allowedFlags) {
    fail(
      "UNSUPPORTED_ZIP_FLAGS",
      `ZIP member ${memberName} uses unsupported general-purpose flags.`
    );
  }
}

function parseCentralDirectory(buffer, endRecord) {
  const start = endRecord.centralDirectoryOffset;
  const end = start + endRecord.centralDirectorySize;
  const entries = [];
  const canonicalNames = new Map();
  let offset = start;

  for (let index = 0; index < endRecord.totalEntries; index += 1) {
    requireRange(buffer, offset, 46, `Central-directory entry ${index + 1}`);

    if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_SIGNATURE) {
      fail(
        "INVALID_CENTRAL_DIRECTORY",
        `Central-directory entry ${index + 1} has an invalid signature.`
      );
    }

    const versionNeeded = buffer.readUInt16LE(offset + 6);
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const expectedCrc32 = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const diskStart = buffer.readUInt16LE(offset + 34);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const recordLength = 46 + filenameLength + extraLength + commentLength;

    requireRange(buffer, offset, recordLength, `Central-directory entry ${index + 1}`);
    if (offset + recordLength > end) {
      fail(
        "INVALID_CENTRAL_DIRECTORY",
        `Central-directory entry ${index + 1} crosses the directory boundary.`
      );
    }
    if (versionNeeded > 20) {
      fail(
        "UNSUPPORTED_ZIP_VERSION",
        `Central-directory entry ${index + 1} requires ZIP version ${versionNeeded}.`
      );
    }
    if (diskStart !== 0) {
      fail("MULTI_DISK_UNSUPPORTED", "A ZIP member starts on another disk.");
    }
    if (
      compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff
      || localHeaderOffset === 0xffffffff
    ) {
      fail("ZIP64_UNSUPPORTED", "A ZIP member uses ZIP64 size or offset markers.");
    }
    if (method !== 0 && method !== 8) {
      fail(
        "UNSUPPORTED_COMPRESSION",
        `Central-directory entry ${index + 1} uses compression method ${method}.`
      );
    }

    const filenameStart = offset + 46;
    const filenameBytes = buffer.subarray(
      filenameStart,
      filenameStart + filenameLength
    );
    const name = decodeMemberName(filenameBytes, flags);
    const extraStart = filenameStart + filenameLength;
    const extra = buffer.subarray(extraStart, extraStart + extraLength);

    validateMemberName(name);
    validateFlags(flags, method, name);
    parseExtraFields(extra, name);

    if (method === 0 && compressedSize !== uncompressedSize) {
      fail(
        "INVALID_STORED_MEMBER",
        `Stored ZIP member ${name} has different compressed and uncompressed sizes.`
      );
    }

    const canonicalName = name.toLowerCase();
    const priorName = canonicalNames.get(canonicalName);

    if (priorName) {
      fail(
        "DUPLICATE_MEMBER",
        `ZIP member names ${priorName} and ${name} are ambiguous duplicates.`
      );
    }
    canonicalNames.set(canonicalName, name);
    entries.push({
      name,
      filenameBytes: Buffer.from(filenameBytes),
      flags,
      method,
      expectedCrc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      dataStart: null
    });
    offset += recordLength;
  }

  if (offset !== end) {
    fail(
      "INVALID_CENTRAL_DIRECTORY",
      "The declared central-directory entry count does not consume the directory."
    );
  }

  return entries;
}

function descriptorMatches(buffer, offset, entry, withSignature) {
  const start = offset + (withSignature ? 4 : 0);
  const length = withSignature ? 16 : 12;

  if (offset + length > buffer.length) {
    return false;
  }
  if (withSignature && buffer.readUInt32LE(offset) !== DATA_DESCRIPTOR_SIGNATURE) {
    return false;
  }

  return (
    buffer.readUInt32LE(start) === entry.expectedCrc32
    && buffer.readUInt32LE(start + 4) === entry.compressedSize
    && buffer.readUInt32LE(start + 8) === entry.uncompressedSize
  );
}

function parseLocalEntries(buffer, entries, centralDirectoryOffset) {
  const localOrder = [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset
  );

  if (localOrder.length > 0 && localOrder[0].localHeaderOffset !== 0) {
    fail(
      "AMBIGUOUS_ZIP_LAYOUT",
      "Leading bytes before the first local ZIP member are not supported."
    );
  }

  for (let index = 0; index < localOrder.length; index += 1) {
    const entry = localOrder[index];
    const offset = entry.localHeaderOffset;
    const boundary = index + 1 < localOrder.length
      ? localOrder[index + 1].localHeaderOffset
      : centralDirectoryOffset;

    if (index > 0 && offset === localOrder[index - 1].localHeaderOffset) {
      fail("DUPLICATE_LOCAL_ENTRY", "Two ZIP members reference the same local header.");
    }

    requireRange(buffer, offset, 30, `Local header for ${entry.name}`);
    if (buffer.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) {
      fail("INVALID_LOCAL_HEADER", `ZIP member ${entry.name} has no valid local header.`);
    }

    const versionNeeded = buffer.readUInt16LE(offset + 4);
    const localFlags = buffer.readUInt16LE(offset + 6);
    const localMethod = buffer.readUInt16LE(offset + 8);
    const localCrc32 = buffer.readUInt32LE(offset + 14);
    const localCompressedSize = buffer.readUInt32LE(offset + 18);
    const localUncompressedSize = buffer.readUInt32LE(offset + 22);
    const filenameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const filenameStart = offset + 30;
    const dataStart = filenameStart + filenameLength + extraLength;

    requireRange(
      buffer,
      offset,
      30 + filenameLength + extraLength,
      `Local header for ${entry.name}`
    );
    if (versionNeeded > 20) {
      fail(
        "UNSUPPORTED_ZIP_VERSION",
        `Local header for ${entry.name} requires ZIP version ${versionNeeded}.`
      );
    }
    if (localFlags !== entry.flags || localMethod !== entry.method) {
      fail(
        "CENTRAL_LOCAL_MISMATCH",
        `ZIP member ${entry.name} disagrees between central and local headers.`
      );
    }

    const localFilename = buffer.subarray(
      filenameStart,
      filenameStart + filenameLength
    );

    if (!localFilename.equals(entry.filenameBytes)) {
      fail(
        "CENTRAL_LOCAL_MISMATCH",
        `ZIP member ${entry.name} has different central and local names.`
      );
    }

    const localExtra = buffer.subarray(
      filenameStart + filenameLength,
      dataStart
    );
    parseExtraFields(localExtra, entry.name);

    if (
      localCompressedSize === 0xffffffff
      || localUncompressedSize === 0xffffffff
    ) {
      fail("ZIP64_UNSUPPORTED", `Local header for ${entry.name} uses ZIP64 markers.`);
    }

    const hasDescriptor = Boolean(entry.flags & 0x0008);

    if (!hasDescriptor) {
      if (
        localCrc32 !== entry.expectedCrc32
        || localCompressedSize !== entry.compressedSize
        || localUncompressedSize !== entry.uncompressedSize
      ) {
        fail(
          "CENTRAL_LOCAL_MISMATCH",
          `ZIP member ${entry.name} has inconsistent CRC or sizes.`
        );
      }
    } else if (
      (localCrc32 !== 0 && localCrc32 !== entry.expectedCrc32)
      || (localCompressedSize !== 0 && localCompressedSize !== entry.compressedSize)
      || (
        localUncompressedSize !== 0
        && localUncompressedSize !== entry.uncompressedSize
      )
    ) {
      fail(
        "CENTRAL_LOCAL_MISMATCH",
        `ZIP member ${entry.name} has inconsistent descriptor placeholders.`
      );
    }

    const dataEnd = dataStart + entry.compressedSize;

    if (dataStart > dataEnd || dataEnd > boundary) {
      fail("OVERLAPPING_MEMBERS", `ZIP member ${entry.name} overlaps another record.`);
    }

    if (hasDescriptor) {
      const candidates = [
        {
          length: 12,
          matches: descriptorMatches(buffer, dataEnd, entry, false)
        },
        {
          length: 16,
          matches: descriptorMatches(buffer, dataEnd, entry, true)
        }
      ].filter((candidate) => (
        candidate.matches && dataEnd + candidate.length === boundary
      ));

      if (candidates.length !== 1) {
        fail(
          "INVALID_DATA_DESCRIPTOR",
          `ZIP member ${entry.name} has no unique valid data descriptor.`
        );
      }
    } else if (dataEnd !== boundary) {
      fail(
        "AMBIGUOUS_ZIP_LAYOUT",
        `ZIP member ${entry.name} has unexplained bytes after its compressed data.`
      );
    }

    entry.dataStart = dataStart;
  }
}

function parseOrdinaryZip(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    fail("INVALID_ARCHIVE_BUFFER", "archiveBuffer must be a Buffer.");
  }

  const endRecord = findEndOfCentralDirectory(buffer);
  const entries = parseCentralDirectory(buffer, endRecord);
  parseLocalEntries(buffer, entries, endRecord.centralDirectoryOffset);
  return entries;
}

function extractMember(buffer, entry) {
  if (entry.uncompressedSize > MAX_VERIFIED_MEMBER_BYTES) {
    fail(
      "MEMBER_TOO_LARGE",
      `ZIP member ${entry.name} exceeds the ${MAX_VERIFIED_MEMBER_BYTES}-byte safety limit.`
    );
  }

  const compressed = buffer.subarray(
    entry.dataStart,
    entry.dataStart + entry.compressedSize
  );
  let extracted;

  if (entry.method === 0) {
    extracted = Buffer.from(compressed);
  } else {
    /** @type {{ buffer: Buffer, engine: { bytesWritten: number } }} */
    let result;

    try {
      result = /** @type {{ buffer: Buffer, engine: { bytesWritten: number } }} */ (
        /** @type {unknown} */ (
          zlib.inflateRawSync(compressed, {
            info: true,
            maxOutputLength: Math.max(1, entry.uncompressedSize)
          })
        )
      );
    } catch (error) {
      fail("DECOMPRESSION_FAILED", `ZIP member ${entry.name} could not be inflated.`, error);
    }

    if (
      !Buffer.isBuffer(result.buffer)
      || !Number.isSafeInteger(result.engine?.bytesWritten)
    ) {
      fail(
        "DECOMPRESSION_FAILED",
        `ZIP member ${entry.name} returned an unsupported decompression result.`
      );
    }
    if (result.engine.bytesWritten !== compressed.length) {
      fail(
        "AMBIGUOUS_COMPRESSED_DATA",
        `ZIP member ${entry.name} contains trailing compressed bytes.`
      );
    }
    extracted = result.buffer;
  }

  if (extracted.length !== entry.uncompressedSize) {
    fail(
      "SIZE_MISMATCH",
      `ZIP member ${entry.name} does not match its declared uncompressed size.`
    );
  }
  if (crc32(extracted) !== entry.expectedCrc32) {
    fail("CRC_MISMATCH", `ZIP member ${entry.name} does not match its declared CRC-32.`);
  }

  return extracted;
}

function uniqueSeasonMember(entries, suffix) {
  const pattern = new RegExp(`^(\\d{4})${suffix.replace(".", "\\.")}$`);
  const matches = [];

  for (const entry of entries) {
    const match = pattern.exec(entry.name);

    if (match) {
      matches.push({ entry, season: match[1] });
    }
  }

  if (matches.length === 0) {
    fail("MISSING_MEMBER", `The archive has no season-prefixed ${suffix} member.`);
  }
  if (matches.length !== 1) {
    fail(
      "AMBIGUOUS_SEASON_MEMBER",
      `The archive has multiple season-prefixed ${suffix} members.`
    );
  }

  return matches[0];
}

function verifyRetrosheetZipProvenance(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("INVALID_INPUT", "ZIP provenance input must be an object.");
  }

  const { archiveBuffer } = input;
  const entries = parseOrdinaryZip(archiveBuffer);
  const selected = [];

  for (const spec of RETROSHEET_MEMBER_SPECS) {
    const supplied = input[spec.bufferKey];

    if (!spec.required && (supplied === null || supplied === undefined)) {
      continue;
    }
    if (!Buffer.isBuffer(supplied)) {
      fail("INVALID_FILE_BUFFER", `${spec.bufferKey} must be a Buffer.`);
    }

    const located = uniqueSeasonMember(entries, spec.suffix);
    selected.push({ ...spec, ...located, supplied });
  }

  const seasons = new Set(selected.map((item) => item.season));

  if (seasons.size !== 1) {
    fail(
      "MIXED_SEASONS",
      "The selected Retrosheet members do not share one season prefix."
    );
  }

  const members = {};

  for (const item of selected) {
    const extracted = extractMember(archiveBuffer, item.entry);

    if (!extracted.equals(item.supplied)) {
      fail(
        "CONTENT_MISMATCH",
        `Supplied ${item.key} bytes do not match ZIP member ${item.entry.name}.`
      );
    }

    members[item.key] = {
      memberName: item.entry.name,
      sha256: sha256(extracted),
      compressionMethod: item.entry.method === 0 ? "stored" : "deflate",
      bytes: extracted.length
    };
  }

  return {
    season: [...seasons][0],
    archiveSha256: sha256(archiveBuffer),
    members
  };
}

module.exports = {
  MAX_VERIFIED_MEMBER_BYTES,
  ZipProvenanceError,
  parseOrdinaryZip,
  verifyRetrosheetZipProvenance
};
