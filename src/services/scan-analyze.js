import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readArchiveFiles, writeArchiveFiles } from "./scan-archive.cjs";

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

function recuperaDataDaNome(file) {
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

async function analisiDate(file,force=true) {

  if (force || file.dt_valida === null || file.dt_valida === undefined) {
    try {
      let bestTry = file.exifDateTimeOriginal ?? file.exifCreateDate ?? file.exifGPSDateStamp ?? file.exifModifyDate;
      if(!(bestTry > new Date("1900-01-01") && bestTry < new Date("2030-01-01"))) {
        bestTry = null;
      }
      var dateFrom = "exif";
      if (bestTry === null || bestTry === undefined) {
        bestTry = recuperaDataDaNome(file);
        if(bestTry > new Date("1900-01-01") && bestTry < new Date("2030-01-01")) {
          var dateFrom = "Nome";
        }else{
          bestTry = null;
        }
      }
      if (bestTry === null) {
        bestTry = file.createdAt;
        var dateFrom = "fs";
      }
      file.dt_valida =new Date(bestTry).toISOString();
      file.dateFrom = dateFrom;
    } catch (error) {
      console.error(`Error generating thumbnail for ${file.fullname}:`, error);
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
    file.albums=dirs.slice(1, -1);
    file.valido=true;
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
  for(const file of files){
      //await analisiHash(file);
      await analisiDate(file);
      await analisiAlbum(file);
      pendingFiles.push(file);
      if(pendingFiles.length >= 100) {
        await writeArchiveFiles(archive, pendingFiles);
        pendingFiles = [];
      }
    }
   if(pendingFiles.length > 0) {
     await writeArchiveFiles(archive, pendingFiles);
   }
   return files;
}
export async function analisiFromArchive(archive,cb,message) {
  let count = 0;
    let pendingFiles = [];
    const files = [];
    try {
      await fs.access(archive);
      files.push(...await readArchiveFiles(archive));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  for(const file of files){
      if(!cb(file)) continue;
      count++;
      pendingFiles.push(file);
      if(count % 100 === 0) console.log(`Processed ${count} files for ${message} analysis, pending writes: ${pendingFiles.length}`);
      if(pendingFiles.length >= 100) {
        await writeArchiveFiles(archive, pendingFiles);
        pendingFiles = [];
      }
    }
   if(pendingFiles.length > 0) {
     await writeArchiveFiles(archive, pendingFiles);
   }
   return files;
}

//await analisiFromArchive("scan\\archive.db", analisiDate,"analisiDate");
//await analisiFromArchive("scan\\archive.db", analisiAlbum,"analisiAlbum");

