import exifr from "exifr";
import fs from "node:fs/promises";
import { readArchiveFiles, writeArchiveFiles } from './scan-archive.cjs';
import { createThumbnail } from './scan-thumbnail.js';
async function readThumbnail(archive) {
  let count = 0;
  let pendingFiles = [];
  const files = [];
  try {
    await fs.access(archive);
    files.push(...await readArchiveFiles(archive));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const file of files) {
    count++;
    if (file.thumbnail) {
      continue;
    }
    await createThumbnail(file);
    if (file.modified) pendingFiles.push(file);
    if (count % 100 === 0) console.log(`Processed ${count} files for thumbnail data, pending writes: ${pendingFiles.length}`);
    if (pendingFiles.length >= 100) {
      await writeArchiveFiles(archive, pendingFiles);
      pendingFiles = [];
    };
  }
  if (pendingFiles.length > 0) {
    await writeArchiveFiles(archive, pendingFiles);
    pendingFiles = [];
  };

  return files;
}
async function readExif(archive) {
  let count = 0;
  let pendingFiles = [];
  const files = [];
  try {
    await fs.access(archive);
    files.push(...await readArchiveFiles(archive));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const file of files) {
    if(file.ext===".mp4"  || file.ext===".mov" || file.ext===".avi" || file.ext===".MOV") continue;
    count++;
    if (file.exifCreateDate || file.exifDateTimeOriginal || file.exifGPSDateStamp || file.exifModifyDate) {
      continue;
    }

    try {
      const exifData = await exifr.parse(file.fullname) ?? null;
      file.exifCreateDate = exifData?.CreateDate ? new Date(exifData.CreateDate).toISOString() : null;
      file.exifDateTimeOriginal = exifData?.DateTimeOriginal ? new Date(exifData.DateTimeOriginal).toISOString() : null;
      file.exifGPSDateStamp = exifData?.GPSDateStamp ? new Date(exifData.GPSDateStamp).toISOString() : null;
      file.exifModifyDate = exifData?.ModifyDate ? new Date(exifData.ModifyDate).toISOString() : null;
      pendingFiles.push(file);
    } catch (error) {
      console.error(`Error reading EXIF data for ${file.fullname}:`, error);
      file.exifCreateDate = null;
      file.exifDateTimeOriginal = null;
      file.exifGPSDateStamp = null;
      file.exifModifyDate = null;
    }
    if (count % 100 === 0) console.log(`Processed ${count} files for EXIF data, pending writes: ${pendingFiles.length}`);
    if (pendingFiles.length >= 100) {
      await writeArchiveFiles(archive, pendingFiles);
      pendingFiles = [];
    };
  }
  if (pendingFiles.length > 0) {
    await writeArchiveFiles(archive, pendingFiles);
    pendingFiles = [];
  };

  return files;
}

export async function readExifFromArchive(archive) {
  const updatedFilelist = await readExif(archive);
  return updatedFilelist;
}

export async function readThumbnailFromArchive(archive) {
  const updatedFilelist = await readThumbnail(archive);
  return updatedFilelist;
}
