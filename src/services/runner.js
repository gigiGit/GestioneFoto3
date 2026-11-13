import path from "node:path";
import exifr from "exifr";
import sharp from "sharp";
import fs from "node:fs";
export async function copia(file, pendingFiles, { force = false, destDir = ".", backupDir = ".", formato = "YYYYMM" }) {
    if (!file.valido) return;
    const data = new Date(file.dt_valida)
    const anno = data.getFullYear();
    const mese = data.toLocaleString('it-IT', { month: 'long' }); // "novembre" (usa 'short' per "nov")
    const giorno = String(data.getDate()).padStart(2, '0');

    const dataFormattata = formato === "YYYYMMDD" ? `${anno}${path.sep}${mese}${path.sep}${giorno}` : `${anno}${path.sep}${mese}`;

    const destinationDir = dataFormattata;
    const destPath = path.join(destDir, backupDir, destinationDir, file.name);
    if (fs.existsSync(destPath) && !force) return true;
    if (file.destPath) return true;
    // Implement the copy functionality here
    try {
        //console.log(`Copying file ${file.fullname} to ${destPath}`);
        //await fs.copyFile(file.fullname, destPath);
        file.destPath = destinationDir;
        pendingFiles.push(file);
        return true;
    } catch (error) {
        console.error(`Error copying file ${file.fullname} to ${destPath}:`, error);
        return false;
    }
}

export async function linkAlbum(file, pendingFiles, { verbose = 0, destDir = ".", backupDir = "backup", albumPath = "albums" }) {
    if (!file.valido) return;
    const srcPath = path.join(destDir, backupDir, file.destPath, file.name);
    for (const album of file.albums) {
        const destPath = path.join(destDir, albumPath, album, file.name);
        try {
            if (verbose > 1) console.log(`Linking file ${srcPath} to ${destPath}`);
            //await fs.symlink(srcPath, destPath);
        } catch (error) {
            console.error(`Error linking file ${srcPath} to ${destPath}:`, error);
        }
    }
    // Implement the copy functionality here
    try {
        //console.log(`Copying file ${file.fullname} to ${destPath}`);
        //await fs.copyFile(file.fullname, destPath);
        //pendingFiles.push(file);
    } catch (error) {
        console.error(`Error copying file ${file.fullname} to ${destPath}:`, error);
    }
    return true;
}


export async function analisiExif(file, pendingFiles, parametri) {
    const unsupportedExtensions = new Set([".mpg", ".pdf", ".m4v", ".wmv", ".mp4", ".mov", ".avi", ".mkv", ".gif", ".3gp", ".bmp"]);
    const ext = file.ext.toLowerCase();
    if (unsupportedExtensions.has(ext)) return true;
    if (!file.valido) return true;
    const { force = false } = parametri;
    if (!force && (file.exifCreateDate || file.exifDateTimeOriginal || file.exifGPSDateStamp || file.exifModifyDate)) {
        return true;
    }
    try {
        const exifData = await exifr.parse(file.fullname) ?? null;
        file.exifCreateDate = exifData?.CreateDate ? new Date(exifData.CreateDate).toISOString() : null;
        file.exifDateTimeOriginal = exifData?.DateTimeOriginal ? new Date(exifData.DateTimeOriginal).toISOString() : null;
        file.exifGPSDateStamp = exifData?.GPSDateStamp ? new Date(exifData.GPSDateStamp).toISOString() : null;
        file.exifModifyDate = exifData?.ModifyDate ? new Date(exifData.ModifyDate).toISOString() : null;
        pendingFiles.push(file);
        return true;
    } catch (error) {
        console.error(`Error reading EXIF data for ${file.fullname}:`, error);
        file.exifCreateDate = null;
        file.exifDateTimeOriginal = null;
        file.exifGPSDateStamp = null;
        file.exifModifyDate = null;
        return false;
    }
    return true;
}


export async function analisiThumbnail(file, pendingFiles, parametri) {
    const supportedExtensions = new Set([
        ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif"
    ]);
    const THUMBNAIL_SIZE = 400;
    const THUMBNAIL_VERSION = 2;

    const { force = false } = parametri;
    const extension = path.extname(file.fullname).toLowerCase();
    if (!supportedExtensions.has(extension)) return true;
    //if (!force && !file.thumbnail && file.valido)
    //    return true;
    try {
        const thumbnail = await sharp(file.fullname)
            .rotate()
            .resize({ width: THUMBNAIL_SIZE, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
        file.thumbnail = `data:image/jpeg;base64,${thumbnail.toString("base64")}`;
        pendingFiles.push(file);
        return true;
    } catch (error) {
        console.error(`Error generating thumbnail for ${file.fullname}:`, error);
        file.thumbnail = null;
        file.valido = false;
        pendingFiles.push(file);
        return false;
    }
}
export function toLocalISOString(date) {
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

export async function analisiAlbum(file, pendingFiles, { force = false }) {
  if (!(force || file.albums === null || file.albums === undefined)) return true;

  try {
    const normalizedPath = path.normalize(file.fullname);
    const dirs = normalizedPath.split(path.sep);
    file.albums = dirs.slice(1, -1);
    file.valido = true;
    pendingFiles.push(file);
  } catch (error) {
    console.error(`Error generating Albums for ${file.fullname}:`, error);
    return false;
  }
  return true;
}

export async function analisiDate(file, pendingFiles, { force = false }) {

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
            pendingFiles.push(file);
        } catch (error) {
            console.error(`Error generating analisiDate for ${file.fullname}:`, error);
            file.dt_valida = null;
        }
    }
}

export function recuperaDataDaNome(file) {
    function isOraValid(txt) {
        return Number(txt) ? Number(txt) % 60 : "00";
    }
    const filename = typeof file.name === "string"
        ? file.name.toLowerCase()
        : typeof file.fullname === "string" ? path.basename(file.fullname).toLowerCase() : "";
    var pattern = [/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/, /(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/, /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, /(\d{4})(\d{2})(\d{2})_(\d{2})-(\d{2})-(\d{2})/,
        /screenshot_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/
    ];

    for (const p of pattern) {
        if (filename.match(p)) {
            var dateArray = filename.match(p);
            if (dateArray.length < 7) continue;
            print(`Filename matches pattern: ${filename} ${p}`);
            var date = `${dateArray[1]}-${dateArray[2]}-${dateArray[3]} ${dateArray[4]}:${dateArray[5]}:${dateArray[6]}`;
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

