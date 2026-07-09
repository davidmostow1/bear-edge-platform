const childProcess = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFile = promisify(childProcess.execFile);

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const DEFAULT_COMPILE_TIMEOUT_MS = 90_000;
const DEFAULT_OCR_TIMEOUT_MS = 30_000;
const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/tiff",
  "image/heic",
  "image/heif",
  "image/webp"
]);

function projectRoot() {
  return path.resolve(__dirname, "..", "..");
}

function nativeSourcePath() {
  return path.resolve(__dirname, "..", "native", "vision-ocr.swift");
}

function nativeBinaryPath(options = {}) {
  return options.binaryPath ?? path.resolve(projectRoot(), "data", "cache", "vision-ocr");
}

function extensionFromMimeType(mimeType) {
  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/tiff":
      return ".tiff";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "image/webp":
      return ".webp";
    default:
      return ".image";
  }
}

function parseDataUrl(value) {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(String(value ?? ""));

  if (!match) {
    return null;
  }

  return {
    mimeType: match[1].toLowerCase(),
    base64: match[2]
  };
}

function decodeImagePayload(input = {}) {
  const dataUrl = parseDataUrl(input.imageBase64 ?? input.dataUrl);
  const mimeType = String(dataUrl?.mimeType ?? input.mimeType ?? "").toLowerCase();
  const rawBase64 = String(dataUrl?.base64 ?? input.imageBase64 ?? input.dataUrl ?? "").replace(/\s+/g, "");

  if (!rawBase64) {
    throw new Error("Screenshot image payload is empty.");
  }

  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported screenshot type "${mimeType || "unknown"}". Upload PNG, JPG, TIFF, HEIC, or WebP.`);
  }

  const buffer = Buffer.from(rawBase64, "base64");

  if (buffer.length === 0) {
    throw new Error("Screenshot image payload decoded to an empty file.");
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`Screenshot is too large. Max supported size is ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`);
  }

  return {
    buffer,
    mimeType,
    fileName: input.fileName ? path.basename(String(input.fileName)) : null,
    extension: extensionFromMimeType(mimeType)
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function shouldCompile(sourcePath, binaryPath) {
  if (!(await fileExists(binaryPath))) {
    return true;
  }

  const [sourceStat, binaryStat] = await Promise.all([fs.stat(sourcePath), fs.stat(binaryPath)]);
  return sourceStat.mtimeMs > binaryStat.mtimeMs;
}

async function ensureVisionOcrBinary(options = {}) {
  if (process.platform !== "darwin") {
    throw new Error("Local screenshot OCR requires macOS Vision. Paste page text instead on non-macOS systems.");
  }

  const sourcePath = options.sourcePath ?? nativeSourcePath();
  const binaryPath = nativeBinaryPath(options);

  await fs.mkdir(path.dirname(binaryPath), { recursive: true });

  if (!(await shouldCompile(sourcePath, binaryPath))) {
    return {
      binaryPath,
      compiled: false
    };
  }

  await execFile(options.swiftcPath ?? "swiftc", [sourcePath, "-o", binaryPath], {
    timeout: options.compileTimeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS,
    maxBuffer: 1024 * 1024
  });

  return {
    binaryPath,
    compiled: true
  };
}

async function recognizeTextFromImage(input = {}, options = {}) {
  const image = decodeImagePayload(input);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bear-edge-ocr-"));
  const imagePath = path.join(tempDir, `screenshot${image.extension}`);
  const warnings = [];

  try {
    await fs.writeFile(imagePath, image.buffer);
    const helper = await ensureVisionOcrBinary(options);
    const { stdout, stderr } = await execFile(helper.binaryPath, [imagePath], {
      timeout: options.ocrTimeoutMs ?? DEFAULT_OCR_TIMEOUT_MS,
      maxBuffer: options.maxBuffer ?? 5 * 1024 * 1024
    });
    const text = String(stdout ?? "").trim();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    if (helper.compiled) {
      warnings.push("Built local macOS Vision OCR helper on first screenshot upload.");
    }

    if (stderr) {
      warnings.push(String(stderr).trim());
    }

    if (lines.length === 0) {
      warnings.push("OCR did not find readable text in this screenshot.");
    }

    return {
      engine: "macos_vision",
      fileName: image.fileName,
      mimeType: image.mimeType,
      bytes: image.buffer.length,
      text,
      lines,
      compiledHelper: helper.compiled,
      warnings
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  decodeImagePayload,
  ensureVisionOcrBinary,
  recognizeTextFromImage
};
