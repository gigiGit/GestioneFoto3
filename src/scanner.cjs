const path = require("node:path");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const scanTools = require("./scan-tools.cjs");

const EXIF_IMAGE_EXTENSIONS = Object.freeze([
  ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif"
]);

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function scanFromCLI({
  sourceFolders,
  batchSize,
  minSize = 0,
  extensions = EXIF_IMAGE_EXTENSIONS,
  scanDir,
  verbose = false,
  onProgress
}) {
  const sourceDir = path.resolve(sourceFolders);
  const outputDir = path.resolve(scanDir);
  const parsedBatchSize = Number(batchSize);
  const parsedMinSize = Number(minSize);

  if (!Number.isSafeInteger(parsedBatchSize) || parsedBatchSize < 1) {
    throw new RangeError("batchSize must be a positive integer");
  }
  if (!Number.isSafeInteger(parsedMinSize) || parsedMinSize < 0) {
    throw new RangeError("minSize must be a non-negative integer");
  }
  if (!Array.isArray(extensions) || extensions.length === 0) {
    throw new TypeError("extensions must be a non-empty array");
  }

  const sourceStats = await fs.stat(sourceDir);
  if (!sourceStats.isDirectory()) {
    throw new TypeError(`Source path is not a directory: ${sourceDir}`);
  }

  const relativeOutput = path.relative(sourceDir, outputDir);
  if (relativeOutput === "" || (!relativeOutput.startsWith(`..${path.sep}`) && relativeOutput !== ".." && !path.isAbsolute(relativeOutput))) {
    throw new Error("The scan output directory must not be inside the source directory");
  }

  const acceptedExtensions = new Set(extensions.map(extension => extension.toLowerCase()));
  await fs.mkdir(outputDir, { recursive: true });
  console.log(`Scanning folders: ${sourceDir} with batch size: ${parsedBatchSize}`);

  let files = [];
  let scannedCount = 0;
  async function saveBatch() {
    if (files.length === 0) return;
    const scanNumber = scanTools.getNextScanNumber(outputDir);
    const scanFilePath = path.join(outputDir, `scansione_${scanNumber}.json`);
    const batch = files;
    files = [];
    await fs.writeFile(scanFilePath, JSON.stringify({ exif: false, files: batch }, null, 2));
    const message = `Saved ${batch.length} files to ${scanFilePath}.`;
    console.log(message);
    onProgress?.(message);
  }

  async function visitDirectory(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visitDirectory(filePath);
        continue;
      }
      if (!entry.isFile() || !acceptedExtensions.has(path.extname(entry.name).toLowerCase())) continue;

      const stats = await fs.stat(filePath);
      if (stats.size < parsedMinSize) continue;
      files.push({
        fullname: filePath,
        ext: path.extname(entry.name),
        name: entry.name,
        size: stats.size,
        createdAt: stats.ctime,
        hash: await hashFile(filePath)
      });
      scannedCount++;
      if (verbose) console.log(`Scanning ${filePath}`);
      if (files.length >= parsedBatchSize) await saveBatch();
    }
  }

  await visitDirectory(sourceDir);
  await saveBatch();
  return scannedCount;
}

module.exports = {
  scanFromCLI
};
