const path = require("node:path");
const scanTools = require("./scan-tools.cjs");
async function readExif(filelist) {
  const exifr = require("exifr");

  await Promise.all(filelist.map(async file => {

    try {
      const exifData = await exifr.parse(file.fullname) ?? null;
      file.exifCreateDate = exifData?.CreateDate ?? null;
      file.exifDateTimeOriginal = exifData?.DateTimeOriginal ?? null;
      file.exifGPSDateStamp = exifData?.GPSDateStamp ?? null;
      file.exifModifyDate = exifData?.ModifyDate ?? null;

    } catch (error) {
      console.error(`Error reading EXIF data for ${file.fullname}:`, error);
      file.exifCreateDate = null;
      file.exifDateTimeOriginal = null;
      file.exifGPSDateStamp = null;
      file.exifModifyDate = null;
    }

  }));
  return filelist;
}

async function readExifFromScanFiles(scanDir,force = false) {
  const fs = require("node:fs/promises");
  const scanList = scanTools.getScanList(scanDir);
  for (const scanFile of scanList) {
    const scanFilePath = path.join(scanDir, scanFile);
    const item = JSON.parse(await fs.readFile(scanFilePath, "utf-8"));
    if (item.exif === true && !force) {
      console.log(`EXIF data already processed for ${scanFilePath}, skipping.`);
      continue;
    }
    if (!Array.isArray(item.files)) {
      throw new TypeError(`Invalid scan file: expected a "files" array in ${scanFilePath}`);
    }

    const updatedFilelist = await readExif(item.files);
    await fs.writeFile(scanFilePath, JSON.stringify({ ...item, exif: true, files: updatedFilelist }, null, 2));
    console.log(`EXIF data saved to ${scanFilePath}.`);
  }
}
module.exports = {
  readExifFromScanFiles
};

if (require.main === module) {
  const scanDir = process.argv[2] || "F:\\ArchivioFoto\\scan";
  readExifFromScanFiles(scanDir,true).catch(error => {
    console.error("Error processing scan files:", error);
    process.exitCode = 1;
  });
}