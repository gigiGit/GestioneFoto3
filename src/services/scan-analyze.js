import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readArchiveFiles, writeArchiveFiles } from "./scan-archive.cjs";
import sharp from "sharp";
import exifr from "exifr";


function toLocalISOString(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (num) => String(Math.floor(Math.abs(num))).padStart(2, '0');

  const localDate = new Date(date.getTime() + offset * 60 * 1000);
  try {
    return localDate.toISOString().slice(0, -1) + `Z`; //${sign}${pad(offset / 60)}:${pad(offset % 60)}
  } catch {
    return null;
  }
}

function creaData(year, month, day, hour = 0, minute = 0, second = 0) {
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day) {
    return null;
  }
  return date;
}
const verbose = false;
const print = verbose ? console.log : () => { };
export function recuperaDataDaNome(file) {
  function isOraValid(txt) {
    return Number(txt) ? Number(txt) % 60 : "00";
  }
  const filename = typeof file.name === "string"
    ? file.name.toLowerCase()
    : typeof file.fullname === "string" ? path.basename(file.fullname).toLowerCase() : "";
  var pattern=[/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/,/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/,/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/,/(\d{4})(\d{2})(\d{2})_(\d{2})-(\d{2})-(\d{2})/,
    /screenshot_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/
  ];
  
  for (const p of pattern) {
    if (filename.match(p)) {
      var dateArray=filename.match(p);
      if(dateArray.length < 7) continue;
      print(`Filename matches pattern: ${filename} ${p}`);
      var date=`${dateArray[1]}-${dateArray[2]}-${dateArray[3]} ${dateArray[4]}:${dateArray[5]}:${dateArray[6]}`;
      print(`${filename} - Matched date: ${date}`);
      return toLocalISOString(new Date(date));
    }
  }
  if (filename >= "1900" && filename < "2030") {
    // Formato YYYY-MM-DD_HH-MM-SS
    var date = filename.slice(0, 4) + "-" + filename.slice(5, 7) + "-" + filename.slice(8, 10) + " " + isOraValid(filename.slice(11, 13)) + ":" + isOraValid(filename.slice(14, 16)) + ":" + isOraValid(filename.slice(16, 18));
      print(`1 Trying date from filename: ${date}`, filename);
    try {
      return toLocalISOString(new Date(date));
    } catch {
      // Formato YYYY-MM-DD_HHMMSS senza trattini tra ore, minuti e secondi
      var date = filename.slice(0, 4) + "-" + filename.slice(5, 7) + "-" + filename.slice(8, 10) + " " + isOraValid(filename.slice(11, 13)) + ":" + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17));
      print(`2 Trying date from filename: ${date}`, filename);
      try {
        
        return toLocalISOString(new Date(date));
      } catch {
        // Formato YYYYMMDD_HHMMSS senza trattini tra data e ora
        var date = filename.slice(0, 4) + "-" + filename.slice(4, 6) + "-" + filename.slice(6, 8) + " " + isOraValid(filename.slice(9, 11)) + ":" + isOraValid(filename.slice(11, 13)) + ":" + isOraValid(filename.slice(13, 15));
      print(`3 Trying date from filename: ${date}`, filename);
        try {
          return toLocalISOString(new Date(date));
        } catch {
          // Formato YYYYMMDD_HHMMSS senza trattini tra data e ora, con eventuale underscore tra data e ora
          var date = filename.slice(0, 4) + "-" + filename.slice(4, 6) + "-" + filename.slice(6, 8) + " " + isOraValid(filename.slice(9, 11)) + ":" + isOraValid(filename.slice(11, 13)) + ":" + isOraValid(filename.slice(13, 15));
          try {
            print(`Trying date from filename: ${date}`, filename);
            return toLocalISOString(new Date(date));
          } catch {
            print(`Failed to parse date from filename: ${date}`, filename);
            return null;
          }
        }
      }
    }
  }
  if (filename.startsWith("img-") && filename >= "img-1900" && filename < "img-2030") {
    var date = filename.slice(4, 8) + "-" + filename.slice(8, 10) + "-" + filename.slice(10, 12) + " " + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17)) + ":" + isOraValid(filename.slice(17, 19));
    try {
      print(`Trying date from filename: ${date}`, filename);
      return toLocalISOString(new Date(date));
    } catch {
      print(`Failed to parse date from filename: ${date}`, filename);
      return null;
    }
  }
  if (filename.startsWith("img_") && filename >= "img_1900" && filename < "img_2030") {
    var date = filename.slice(4, 8) + "-" + filename.slice(8, 10) + "-" + filename.slice(10, 12) + " " + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17)) + ":" + isOraValid(filename.slice(17, 19));
    try {
      print(`Trying date from filename: ${date}`, filename);
      return toLocalISOString(new Date(date));
    } catch {
      print(`Failed to parse date from filename: ${date}`, filename);
      return null;
    }
  }

  if (filename.startsWith("vid-") && filename >= "vid-1900" && filename < "vid-2030") {
    var date = filename.slice(4, 8) + "-" + filename.slice(8, 10) + "-" + filename.slice(10, 12) + " " + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17)) + ":" + isOraValid(filename.slice(17, 19));
    try {
      print(`Trying date from filename: ${date}`, filename);
      return toLocalISOString(new Date(date));
    } catch {
      print(`Failed to parse date from filename: ${date}`, filename);
      return null;
    }
  }
  if (filename.startsWith("vid_") && filename >= "vid_1900" && filename < "vid_2030") {
    var date = filename.slice(4, 8) + "-" + filename.slice(8, 10) + "-" + filename.slice(10, 12) + " " + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17)) + ":" + isOraValid(filename.slice(17, 19));
    try {
      print(`Trying date from filename: ${date}`, filename);
      return toLocalISOString(new Date(date));
    } catch {
      print(`Failed to parse date from filename: ${date}`, filename);
      return null;
    }
  }

  if (filename.startsWith("vid") && filename >= "vid1900" && filename < "vid2030") {
    var date = filename.slice(3, 7) + "-" + filename.slice(7, 9) + "-" + filename.slice(9, 11) + " " + isOraValid(filename.slice(11, 13)) + ":" + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17));
    try {
      print(`Trying date from filename: ${date}`, filename);
      return toLocalISOString(new Date(date));
    } catch {
      print(`Failed to parse date from filename: ${date}`, filename);
      return null;
    }
  }
  if (filename.startsWith("screenshot_") && filename >= "screenshot_1900" && filename < "screenshot_2030") {
    var date = filename.slice(11, 15) + "-" + filename.slice(15, 17) + "-" + filename.slice(17, 19) + " " + isOraValid(filename.slice(20, 22)) + ":" + isOraValid(filename.slice(22, 24)) + ":" + isOraValid(filename.slice(24, 26));
    try {
      print(`Trying date from filename: ${date}`, filename);
      return toLocalISOString(new Date(date));
    } catch {
      print(`Failed to parse date from filename: ${date}`, filename);
      return null;
    }
  }
}


function recuperaDataDaFullName(file) {
  const filename = typeof file.name === "string"
    ? file.name
    : typeof file.fullname === "string" ? path.basename(file.fullname) : "";

  const datePatterns = [
    /(?<!\d)(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?:[T _-](\d{2})[:._-]?(\d{2})(?:[:._-]?(\d{2}))?)?(?!\d)/g,
    /(?<!\d)(\d{4})(\d{2})(\d{2})(?:[T _-](\d{2})[:._-]?(\d{2})(?:[:._-]?(\d{2}))?)?(?!\d)/g,
    /(?<!\d)(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})(?:[T _-](\d{2})[:._-]?(\d{2})(?:[:._-]?(\d{2}))?)?(?!\d)/g,
    /(?<!\d)(\d{2})(\d{2})(\d{4})(?:[T _-](\d{2})[:._-]?(\d{2})(?:[:._-]?(\d{2}))?)?(?!\d)/g
  ];

  for (const [patternIndex, pattern] of datePatterns.entries()) {
    for (const match of filename.matchAll(pattern)) {
      const [, first, second, third, hour, minute, secondOfMinute] = match;
      const dayFirst = patternIndex >= 2;
      const year = Number(dayFirst ? third : first);
      const month = Number(second);
      const day = Number(dayFirst ? first : third);
      const date = creaData(year, month, day, Number(hour || 0), Number(minute || 0), Number(secondOfMinute || 0));
      if (date) return date;
    }
  }

  if (typeof file.fullname !== "string") return null;
  const folders = path.dirname(file.fullname).split(/[\\/]+/);
  for (let index = folders.length - 1; index >= 0; index--) {
    const year = Number(folders[index]);
    const month = Number(folders[index + 1]);
    if (!/^\d{4}$/.test(folders[index]) || !/^\d{1,2}$/.test(folders[index + 1] || "")) {
      continue;
    }

    const dayFolder = folders[index + 2];
    if (/^\d{1,2}$/.test(dayFolder || "")) {
      const date = creaData(year, month, Number(dayFolder));
      if (date) return date;
      continue;
    }
    const date = creaData(year, month, 1);
    if (date) return date;
  }
  return null;
}

async function analisiDate(file, force = true) {

  if (force || file.dt_valida === null || file.dt_valida === undefined) {
    try {
      let bestTry = file.exifDateTimeOriginal ?? file.exifCreateDate ?? file.exifGPSDateStamp ?? file.exifModifyDate;
      if (!(bestTry > "1900" && bestTry < "2030")) {

        bestTry = null;
      }
      var dateFrom = "exif";
      if (bestTry === null || bestTry === undefined) {
        bestTry = recuperaDataDaNome(file);
        if (bestTry > "1900" && bestTry < "2030") {
          var dateFrom = "Nome";
        } else {
          bestTry = null;
        }
      }
      if (bestTry === null) {
        bestTry = file.createdAt;
        var dateFrom = "fs";
      }
      file.dt_valida = toLocalISOString(new Date(bestTry));
      file.dateFrom = dateFrom;
    } catch (error) {
      console.error(`Error generating analisiDate for ${file.fullname}:`, error);
      file.dt_valida = null;
    }
  }
}

async function analisiAlbum(file) {
  if (file.albums === null || file.albums === undefined)
    file.albums = [];
  try {
    const normalizedPath = path.normalize(file.fullname);
    const dirs = normalizedPath.split(path.sep);
    file.albums = dirs.slice(1, -1);
    file.valido = true;
  } catch (error) {
    console.error(`Error generating Albums for ${file.fullname}:`, error);
  }
}
export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}


export async function analisi(archive) {
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
    //await analisiHash(file);
    await analisiDate(file);
    await analisiAlbum(file);
    pendingFiles.push(file);
    if (pendingFiles.length >= 100) {
      await writeArchiveFiles(archive, pendingFiles);
      pendingFiles = [];
    }
  }
  if (pendingFiles.length > 0) {
    await writeArchiveFiles(archive, pendingFiles);
  }
  return files;
}
export async function analisiFromArchive(archive, funcName) {
  let count = 0;
  let pendingFiles = [];
  const files = [];
  try {
    await fs.access(archive);
    files.push(...await readArchiveFiles(archive));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const cb = funcName === "analisiDate" ? analisiDate : funcName === "analisiAlbum" ? analisiAlbum : null;
  if (!cb) throw new Error(`Invalid function name: ${funcName}`);
  for (const file of files) {
    await cb(file);
    count++;
    pendingFiles.push(file);
    if (count % 100 === 0) console.log(`Processed ${count} files for ${funcName} analysis, pending writes: ${pendingFiles.length}`);
    if (pendingFiles.length >= 100) {
      await writeArchiveFiles(archive, pendingFiles);
      pendingFiles = [];
    }
  }
  if (pendingFiles.length > 0) {
    await writeArchiveFiles(archive, pendingFiles);
  }
  return files;
}

//await analisiFromArchive("scan\\archive.db", analisiDate,"analisiDate");
//await analisiFromArchive("scan\\archive.db", analisiAlbum,"analisiAlbum");

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif"
]);
const THUMBNAIL_SIZE = 400;
const THUMBNAIL_VERSION = 2;

export async function createThumbnail(file) {

  const extension = path.extname(file.fullname).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return file;
  try {
    const thumbnail = await sharp(file.fullname)
      .rotate()
      .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    file.thumbnail = `data:image/jpeg;base64,${thumbnail.toString("base64")}`;
    file.modified = true;
  } catch (error) {
    console.error(`Error generating thumbnail for ${file.fullname}:`, error);
    file.thumbnail = null;
    file.modified = false;
  }
  return file;
}

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
    if (file.ext === ".mp4" || file.ext === ".mov" || file.ext === ".avi" || file.ext === ".MOV") continue;
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
