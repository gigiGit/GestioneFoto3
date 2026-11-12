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
  function isOraValid(txt){
    return Number(txt) ? txt:"00";
  }
  const filename = typeof file.name === "string"
    ? file.name
    : typeof file.fullname === "string" ? path.basename(file.fullname) : "";

  if (filename >= "1900" && filename < "2030") {
    var date = filename.slice(0, 4)+"-"+filename.slice(5, 7)+"-"+filename.slice(8, 10)+" "+isOraValid(filename.slice(11, 13))+":"+isOraValid(filename.slice(13, 15))+":"+isOraValid(filename.slice(15, 17));
    try {
      return new Date(date).toISOString();
    } catch {
    var date = filename.slice(0, 4)+"-"+filename.slice(4, 6)+"-"+filename.slice(6, 8)+" "+isOraValid(filename.slice(9, 11))+":"+isOraValid(filename.slice(11, 13))+":"+isOraValid(filename.slice(13, 15));
    try {
      return new Date(date).toISOString();
    } catch {
      return null;
    }
    }
  }
  if (filename >= "img-1900" && filename < "img-2030") {
    var date = filename.slice(4, 8)+"-"+filename.slice(8, 10)+"-"+filename.slice(10, 12)+" "+isOraValid(filename.slice(13, 15))+":"+isOraValid(filename.slice(15, 17))+":"+isOraValid(filename.slice(17, 19));
    try {
      return new Date(date).toISOString();
    } catch {
      return null;
    }
  }
  if (filename >= "IMG-1900" && filename < "IMG-2030") {
    var date = filename.slice(4, 8)+"-"+filename.slice(8, 10)+"-"+filename.slice(10, 12)+" "+isOraValid(filename.slice(13, 15))+":"+isOraValid(filename.slice(15, 17))+":"+isOraValid(filename.slice(17, 19));
    try {
      return new Date(date).toISOString();
    } catch {
      return null;
    }
  }
  if (filename >= "IMG_1900" && filename < "IMG_2030") {
    var date = filename.slice(4, 8)+"-"+filename.slice(8, 10)+"-"+filename.slice(10, 12)+" "+isOraValid(filename.slice(13, 15))+":"+isOraValid(filename.slice(15, 17))+":"+isOraValid(filename.slice(17, 19));
    try {
      return new Date(date).toISOString();
    } catch {
      return null;
    }
  }
  if (filename >= "VID1900" && filename < "VID2030") {
    var date = filename.slice(3, 7)+"-"+filename.slice(7, 9)+"-"+filename.slice(9, 11)+" "+isOraValid(filename.slice(11, 13))+":"+isOraValid(filename.slice(13, 15))+":"+isOraValid(filename.slice(15, 17));
    try {
      return new Date(date).toISOString();
    } catch {
      return null;
    }
  }

  if (filename >= "VID-1900" && filename < "VID-2030") {
    var date = filename.slice(4, 8)+"-"+filename.slice(8, 10)+"-"+filename.slice(10, 12)+" "+isOraValid(filename.slice(13, 15))+":"+isOraValid(filename.slice(15, 17))+":"+isOraValid(filename.slice(17, 19));
    try {
      return new Date(date).toISOString();
    } catch {
      return null;
    }
  }
  if (filename >= "VID_1900" && filename < "VID_2030") {
    var date = filename.slice(4, 8)+"-"+filename.slice(8, 10)+"-"+filename.slice(10, 12)+" "+isOraValid(filename.slice(13, 15))+":"+isOraValid(filename.slice(15, 17))+":"+isOraValid(filename.slice(17, 19));
    try {
      return new Date(date).toISOString();
    } catch {
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

async function analisiDate(file,force=true) {

  if (force || file.dt_valida === null || file.dt_valida === undefined) {
    try {
      let bestTry = file.exifDateTimeOriginal ?? file.exifCreateDate ?? file.exifGPSDateStamp ?? file.exifModifyDate;
      if(!(bestTry > "1900" && bestTry < "2030")) {
        
        bestTry = null;
      }
      var dateFrom = "exif";
      if (bestTry === null || bestTry === undefined) {
        bestTry = recuperaDataDaNome(file);
        if(bestTry > "1900" && bestTry < "2030") {
          var dateFrom = "Nome";
        }else{
          console.log(`Invalid Nome date for ${file.fullname}:`, bestTry);
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

