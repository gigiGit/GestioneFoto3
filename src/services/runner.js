import path from "node:path";
import exifr from "exifr";
import sharp from "sharp";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export async function copia(file, pendingFiles, { force = false, destDir, backupPath, formato, verbose }) {
    if (!file.valido && !file.dt_valida) return false;
    const data = new Date(file.dt_valida)
    const anno = data.getFullYear();
    const mese = data.toLocaleString('it-IT', { month: 'long' }); // "novembre" (usa 'short' per "nov")
    const giorno = String(data.getDate()).padStart(2, '0');
    const dataFormattata = formato === "YYYYMMDD" ? `${anno}${path.sep}${mese}${path.sep}${giorno}` : `${anno}${path.sep}${mese}`;
    const destinationDir = dataFormattata;
    const destPath = path.join(destDir, backupPath, destinationDir, file.name);
    if (fs.existsSync(destPath) ) {
        if (file.destPath) return false;
        file.destPath = destinationDir;
        pendingFiles.push(file);
        return true;
    }
    // Implement the copy functionality here
    try {
        if (verbose > 1) console.log(`Copying file ${file.fullname} to ${destPath}`);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(file.fullname, destPath);
        file.destPath = destinationDir;
        pendingFiles.push(file);
        return true;
    } catch (error) {
        console.error(`Error copying file ${file.fullname} to ${destPath}:`, error);
        return false;
    }
}
export async function hashFile(file, pendingFiles, { force = false }) {
    if (!force && file.hash) return false;
    try {
        const Hash = await new Promise((resolve, reject) => {
            const hash = createHash("sha256");
            const stream = createReadStream(file.fullname);
            stream.on("error", reject);
            stream.on("data", chunk => hash.update(chunk));
            stream.on("end", () => resolve(hash.digest("hex")));
        });
        file.hash = Hash;
        pendingFiles.push(file);
        return true;
    } catch (error) {
        console.error(`Error hashing file ${file.fullname}:`, error);
        return false;
    }
}

export async function linkAlbum(file, pendingFiles, { verbose = 0, destDir, backupPath, albumPath }) {
    if (!file.valido) return false;
    const srcPath = path.join(destDir, backupPath, file.destPath, file.name);
    if (fs.existsSync(srcPath)) {
        for (const album of file.albums) {
            const destPath = path.join(destDir, albumPath, album, file.name);
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            if (fs.existsSync(destPath)) continue;
            try {
                if (verbose > 1) console.log(`Linking file ${srcPath} to ${destPath}`);
                fs.symlinkSync(srcPath, destPath);
            } catch (error) {
                console.error(`Error linking file ${srcPath} to ${destPath}:`, error);
                return false;
            }
        }
        return true;
    } else {
        console.warn(`Source file does not exist: ${srcPath}`);
        return false;
    }
}


export async function analisiExif(file, pendingFiles, parametri) {
    if (!file.valido) return false;
    const unsupportedExtensions = new Set([".mpg", ".pdf", ".m4v", ".wmv", ".mp4", ".mov", ".avi", ".mkv", ".gif", ".3gp", ".bmp"]);
    const ext = file.ext.toLowerCase();
    if (unsupportedExtensions.has(ext)) return false;

    const { force = false } = parametri;
    if (!force && (file.exifCreateDate || file.exifDateTimeOriginal || file.exifGPSDateStamp || file.exifModifyDate)) {
        return false;
    }
    try {
        const exifData = await exifr.parse(file.fullname) ?? null;
        file.exifCreateDate = exifData?.CreateDate ? new Date(exifData.CreateDate).toISOString() : null;
        file.exifDateTimeOriginal = exifData?.DateTimeOriginal ? new Date(exifData.DateTimeOriginal).toISOString() : null;
        file.exifGPSDateStamp = exifData?.GPSDateStamp ? new Date(exifData.GPSDateStamp).toISOString() : null;
        file.exifModifyDate = exifData?.ModifyDate ? new Date(exifData.ModifyDate).toISOString() : null;
        if (parametri.verbose > 1) console.log(`EXIF data for ${file.fullname}:`, exifData);
        pendingFiles.push(file);
        return true;
    } catch (error) {
        console.error(`Error reading EXIF data for ${file.fullname}:`, error);
        file.exifCreateDate = null;
        file.exifDateTimeOriginal = null;
        file.exifGPSDateStamp = null;
        file.exifModifyDate = null;
        pendingFiles.push(file);
        return true;
    }
}


export async function analisiThumbnail(file, pendingFiles, parametri) {
    if (!file.valido) return false;
    const supportedExtensions = new Set([
        ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif"
    ]);
    const THUMBNAIL_SIZE = 400;
    const THUMBNAIL_VERSION = 2;

    const { force = false, verbose } = parametri;
    const extension = path.extname(file.fullname).toLowerCase();
    if (!supportedExtensions.has(extension)) return false;
    if (!force && file.thumbnail)
        return false;
    try {
        const thumbnail = await sharp(file.fullname)
            .rotate()
            .resize({ width: THUMBNAIL_SIZE, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
        file.thumbnail = `data:image/jpeg;base64,${thumbnail.toString("base64")}`;
        file.valido = true;
        if (verbose > 1) console.log(`Generated thumbnail for ${file.fullname}`);
        pendingFiles.push(file);
        return true;
    } catch (error) {
        console.error(`Error generating thumbnail for ${file.fullname}:`, error);
        file.thumbnail = null;
        file.valido = false;
        pendingFiles.push(file);
        return true;
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
    if (!(force || file.albums === null || file.albums === undefined)) return false;

    try {
        const normalizedPath = path.normalize(file.fullname);
        const dirs = normalizedPath.split(path.sep);
        file.albums = dirs.slice(1, -1);
        pendingFiles.push(file);
        return true;
    } catch (error) {
        console.error(`Error generating Albums for ${file.fullname}:`, error);
        return false;
    }
}

export async function analisiDate(file, pendingFiles, { force = false,verbose=0 }) {
if(verbose>1) console.log(`Starting analisiDate for ${file.fullname}`);
//casi particolari
if(file.name ==="IMG_2145.1.jpg" ||
   file.name ==="IMG_2146.1.jpg" ||
   file.name ==="IMG_2147.1.jpg" ||
   file.name ==="IMG_2148.1.jpg" ||
   file.name ==="IMG_2149.1.jpg" ||
   file.name ==="IMG_2150.1.jpg" ||
   file.name ==="IMG_2151.1.jpg" ||
   file.name ==="IMG_2152.1.jpg" ||
   file.name ==="IMG_2153.1.jpg" ||
   file.name ==="img_2145.1.jpg" ||
   file.name ==="img_2146.1.jpg" ||
   file.name ==="img_2147.1.jpg" ||
   file.name ==="img_2148.1.jpg" ||
   file.name ==="img_2149.1.jpg" ||
   file.name ==="img_2150.1.jpg" ||
   file.name ==="img_2151.1.jpg" ||
   file.name ==="img_2152.1.jpg" ||
   file.name ==="img_2153.1.jpg") {
    if(verbose>1) console.log(`Special case for ${file.fullname}`);
    file.exifCreateDate = "2011-06-01T00:00:00.000Z";
    file.exifDateTimeOriginal = "2011-06-01T00:00:00.000Z";
    file.exifModifyDate = "2011-06-01T00:00:00.000Z";
    file.dt_valida=  "2011-06-01T00:00:00.000Z";
    pendingFiles.push(file);
    return true;
}
try {
        let bestTry = file.exifDateTimeOriginal ?? file.exifCreateDate ?? file.exifGPSDateStamp ?? file.exifModifyDate;
        if (!(bestTry > "1900" && bestTry < "2030")) {
            bestTry = null;
        }
        if(verbose>1) console.log(`EXIF Best try for ${file.fullname}: ${bestTry}`);
        var dateFrom = "exif";
        if (bestTry === null || bestTry === undefined) {
            bestTry = recuperaDataDaNome(file);
            if(verbose>1) console.log(`recuperaDataDaNome Best try for ${file.fullname}: ${bestTry}`);
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
        return true;
    } catch (error) {
        console.error(`Error generating analisiDate for ${file.fullname}:`, error);
        file.dt_valida = null;
        return false
    }

    return false;
}

export function recuperaDataDaNome(file) {
    function isOraValid(txt) {
        return Number(txt) ? Number(txt) % 60 : "00";
    }
    const filename =file.name.toLowerCase();
    console.log(`Checking filename: ${filename}`);
    if (filename.startsWith("fotoscandiano")) {
        return "1950-01-01T00:00:00.000Z";
    }
    if (filename.startsWith("giuliano")) {
        return "1961-01-07T00:00:00.000Z";
    }
    var patt6 = [/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/, /(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/, /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, /(\d{4})(\d{2})(\d{2})_(\d{2})-(\d{2})-(\d{2})/,
        /screenshot_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/,/vid_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/,
        /vid-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/,/vid(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/ ];
    var patt3=[/img-(\d{4})(\d{2})(\d{2})-wa/,
        /vid-(\d{4})(\d{2})(\d{2})-wa/
];

    for (const p of patt6) {
        if (filename.match(p)) {
            var dateArray = filename.match(p);
            if (dateArray.length < 7) continue;
            //console.log(`Filename matches pattern: ${file.fullname} ${p}`);
            var date = `${dateArray[1]}-${dateArray[2]}-${dateArray[3]} ${dateArray[4]}:${dateArray[5]}:${dateArray[6]}`;
            return toLocalISOString(new Date(date));
        }
    }
    for (const p of patt3) {
        if (filename.match(p)) {
            var dateArray = filename.match(p);
            if (dateArray.length < 4) continue;
            var date = `${dateArray[1]}-${dateArray[2]}-${dateArray[3]} 00:00:00`;
            //console.log(`Filename matches pattern: ${file.fullname} ${date}`);
            return toLocalISOString(new Date(date));
        }
    }
    if (file.albums && file.albums[0]) {
        return file.albums[0]
        .replace("Gennaio", "01")
        .replace("Febbraio", "02")
            .replace("Marzo", "03")
            .replace("Aprile", "04")
            .replace("Maggio", "05")
            .replace("Giugno", "06")
            .replace("Luglio", "07")
            .replace("Agosto", "08")
            .replace("Settembre", "09")
            .replace("Ottobre", "10")
            .replace("Novembre", "11")
            .replace("Dicembre", "12")+"T00:00:00.000Z";
    }


    if (filename >= "1900" && filename < "2030") {
        // Formato YYYY-MM-DD_HH-MM-SS
        var date = filename.slice(0, 4) + "-" + filename.slice(5, 7) + "-" + filename.slice(8, 10) + " " + isOraValid(filename.slice(11, 13)) + ":" + isOraValid(filename.slice(14, 16)) + ":" + isOraValid(filename.slice(16, 18));
        //console.log(`1 Trying date from filename: ${date}`, filename);
        try {
            return toLocalISOString(new Date(date));
        } catch {
            // Formato YYYY-MM-DD_HHMMSS senza trattini tra ore, minuti e secondi
            var date = filename.slice(0, 4) + "-" + filename.slice(5, 7) + "-" + filename.slice(8, 10) + " " + isOraValid(filename.slice(11, 13)) + ":" + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17));
            //console.log(`2 Trying date from filename: ${date}`, filename);
            try {

                return toLocalISOString(new Date(date));
            } catch {
                // Formato YYYYMMDD_HHMMSS senza trattini tra data e ora
                var date = filename.slice(0, 4) + "-" + filename.slice(4, 6) + "-" + filename.slice(6, 8) + " " + isOraValid(filename.slice(9, 11)) + ":" + isOraValid(filename.slice(11, 13)) + ":" + isOraValid(filename.slice(13, 15));
                //print(`3 Trying date from filename: ${date}`, filename);
                try {
                    return toLocalISOString(new Date(date));
                } catch {
                    // Formato YYYYMMDD_HHMMSS senza trattini tra data e ora, con eventuale underscore tra data e ora
                    var date = filename.slice(0, 4) + "-" + filename.slice(4, 6) + "-" + filename.slice(6, 8) + " " + isOraValid(filename.slice(9, 11)) + ":" + isOraValid(filename.slice(11, 13)) + ":" + isOraValid(filename.slice(13, 15));
                    try {
                        //print(`Trying date from filename: ${date}`, filename);
                        return toLocalISOString(new Date(date));
                    } catch {
                        //print(`Failed to parse date from filename: ${date}`, filename);
                        return null;
                    }
                }
            }
        }
    }
    if (filename.startsWith("img-") && filename >= "img-1900" && filename < "img-2030") {
        var date = filename.slice(4, 8) + "-" + filename.slice(8, 10) + "-" + filename.slice(10, 12) + " " + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17)) + ":" + isOraValid(filename.slice(17, 19));
        try {
            //print(`Trying date from filename: ${date}`, filename);
            return toLocalISOString(new Date(date));
        } catch {
            //print(`Failed to parse date from filename: ${date}`, filename);
            return null;
        }
    }
    if (filename.startsWith("img_") && filename >= "img_1900" && filename < "img_2030") {
        var date = filename.slice(4, 8) + "-" + filename.slice(8, 10) + "-" + filename.slice(10, 12) + " " + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17)) + ":" + isOraValid(filename.slice(17, 19));
        try {
            //print(`Trying date from filename: ${date}`, filename);
            return toLocalISOString(new Date(date));
        } catch {
            //print(`Failed to parse date from filename: ${date}`, filename);
            return null;
        }
    }

    if (filename.startsWith("vid-") && filename >= "vid-1900" && filename < "vid-2030") {
        var date = filename.slice(4, 8) + "-" + filename.slice(8, 10) + "-" + filename.slice(10, 12) + " " + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17)) + ":" + isOraValid(filename.slice(17, 19));
        try {
            //print(`Trying date from filename: ${date}`, filename);
            return toLocalISOString(new Date(date));
        } catch {
            //print(`Failed to parse date from filename: ${date}`, filename);
            return null;
        }
    }
    if (filename.startsWith("vid_") && filename >= "vid_1900" && filename < "vid_2030") {
        var date = filename.slice(4, 8) + "-" + filename.slice(8, 10) + "-" + filename.slice(10, 12) + " " + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17)) + ":" + isOraValid(filename.slice(17, 19));
        try {
            //print(`Trying date from filename: ${date}`, filename);
            return toLocalISOString(new Date(date));
        } catch {
            //print(`Failed to parse date from filename: ${date}`, filename);
            return null;
        }
    }

    if (filename.startsWith("vid") && filename >= "vid1900" && filename < "vid2030") {
        var date = filename.slice(3, 7) + "-" + filename.slice(7, 9) + "-" + filename.slice(9, 11) + " " + isOraValid(filename.slice(11, 13)) + ":" + isOraValid(filename.slice(13, 15)) + ":" + isOraValid(filename.slice(15, 17));
        try {
            //print(`Trying date from filename: ${date}`, filename);
            return toLocalISOString(new Date(date));
        } catch {
            //print(`Failed to parse date from filename: ${date}`, filename);
            return null;
        }
    }
    if (filename.startsWith("screenshot_") && filename >= "screenshot_1900" && filename < "screenshot_2030") {
        var date = filename.slice(11, 15) + "-" + filename.slice(15, 17) + "-" + filename.slice(17, 19) + " " + isOraValid(filename.slice(20, 22)) + ":" + isOraValid(filename.slice(22, 24)) + ":" + isOraValid(filename.slice(24, 26));
        try {
            //print(`Trying date from filename: ${date}`, filename);
            return toLocalISOString(new Date(date));
        } catch {
            //print(`Failed to parse date from filename: ${date}`, filename);
            return null;
        }
    }
}

