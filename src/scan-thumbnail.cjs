const path = require("node:path");
const fs = require("node:fs/promises");
const scanTools = require("./scan-tools.cjs");

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif"
]);
const THUMBNAIL_SIZE = 400;
const THUMBNAIL_VERSION = 2;

async function createThumbnail(file) {
  const sharp = require("sharp");
  const extension = path.extname(file.fullname).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return;
  
  try {
    const thumbnail = await sharp(file.fullname)
      .rotate()
      .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    file.thumbnail = `data:image/jpeg;base64,${thumbnail.toString("base64")}`;
  } catch (error) {
    console.error(`Error generating thumbnail for ${file.fullname}:`, error);
    file.thumbnail = null;
  }
}

async function generateThumbnailsFromScanFiles(scanDir) {
  const scanList = scanTools.getScanList(scanDir);

  for (const scanFile of scanList) {
    const scanFilePath = path.join(scanDir, scanFile);
    const item = JSON.parse(await fs.readFile(scanFilePath, "utf-8"));
    if (!Array.isArray(item.files)) {
      throw new TypeError(`Invalid scan file: expected a "files" array in ${scanFilePath}`);
    }
    if (item.thumbnailVersion === THUMBNAIL_VERSION &&
        item.files?.every(file => !IMAGE_EXTENSIONS.has(path.extname(file.fullname).toLowerCase()) ||
          file.thumbnail?.startsWith("data:image/jpeg;base64,"))) {
      console.log(`Thumbnails already generated for ${scanFilePath}, skipping.`);
      continue;
    }

    await Promise.all(item.files.map(file => createThumbnail(file)));
    await fs.writeFile(scanFilePath, JSON.stringify({
      ...item,
      thumbnails: true,
      thumbnailVersion: THUMBNAIL_VERSION
    }, null, 2));
    console.log(`Thumbnails saved for ${scanFilePath}.`);
  }
}

module.exports = {
  generateThumbnailsFromScanFiles
};

if (require.main === module) {
  const scanDir = process.argv[2] || "F:\\ArchivioFoto\\scan";
  generateThumbnailsFromScanFiles(scanDir).catch(error => {
    console.error("Error processing scan files:", error);
    process.exitCode = 1;
  });
}
