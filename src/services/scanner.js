import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {  writeArchiveFiles, readSomeRecords } from "./scan-archive.cjs";
import { linkAlbum, analisiExif, analisiThumbnail, copia, analisiDate, analisiAlbum, hashFile } from "./runner.js";
export const SCAN_FILE_NAME = "scan.json";

/**
 * Carica i record dall'archivio ed esegue l'operazione richiesta sui file.
 * @returns {Promise<{ scanFile: string, files: object[] }>}
 */
function canCreateSymlinks(targetDir) {
const testLink = path.join(targetDir, `.symlink_test_${Date.now()}`);
  try {
    // Tenta di creare un symlink fittizio nella cartella
    fs.symlinkSync('.', testLink);
    // Se riesce, lo rimuove subito
    fs.unlinkSync(testLink);
    return true;
  } catch (err) {
    // Su exFAT o FAT32 verrà sollevata un'eccezione
    return false;
  }
}
async function noLink(file, pendingFiles, option) {
  console.warn(`Cannot create symlinks for file: ${file.fullname}`);
  return false;
}
export async function analisiFromArchive(funcName, parametri) {
  let count = 0;
  let errorCount = 0;
  let pendingFiles = [];
  const files = [];
  const dt1 = new Date();
  const archivePath = path.join(parametri.destDir, parametri.archive);
  try {
    fs.accessSync(archivePath);
    files.push(...await readSomeRecords(archivePath,parametri.filters));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let cb = null;

  let option = parametri || {};
  switch (funcName) {
    case "exif": cb = analisiExif; break;
    case "thumbnail": cb = analisiThumbnail; break;
    case "linkAlbum":
      cb = linkAlbum; 
      if (!canCreateSymlinks(parametri.destDir)) {
        cb=noLink;
      }

    break;
    case "copia": cb = copia; break;
    case "analisiDate": cb = analisiDate;break;
    case "hash": cb = hashFile; break;
    case "analisiAlbum": cb = analisiAlbum; break;
    default:
      throw new Error(`Invalid function name: ${funcName}`);
  }
  if (!option.count) option.count = 500;

  console.log(`Starting analysis for function: ${funcName} Files da analizzare ${files.length}`);
  console.log("archivePath:", archivePath);
  const dt2 = new Date();
  console.log(`Time elapsed since start: ${dt2 - dt1} ms`);
  for (const file of files) {
    const exitCode = await cb(file, pendingFiles, option);
    if (exitCode === false) errorCount++;
    count++;
    if (option.verbose && count % option.count === 0) console.log(`Processed ${count} files for ${funcName} - pending writes: ${pendingFiles.length}`);
    if (pendingFiles.length >= option.count) {
      await writeArchiveFiles(archivePath, pendingFiles);
      pendingFiles = [];
    }
  }
  if (pendingFiles.length > 0) {
    await writeArchiveFiles(archivePath, pendingFiles);
  }
  console.log(`Analysis completed for function: ${funcName}`);
  console.log(`Total files processed: ${count}`);
  console.log(`Total errors: ${errorCount}`);
  const dt3 = new Date();
  console.log(`Total time elapsed: ${dt3 - dt1} ms`);
  return { errorCount, count, files, readTime: dt2 - dt1, scanTime: dt3 - dt2, TotalTime: dt3 - dt1 };
}
/** legge i file presenti nelle SourceDir specificate in parametri.sourceFolders,
 *  e aggiorna l'archivio.
 */
export async function scanSource(parametri) {

  const EXIF_IMAGE_EXTENSIONS = Object.freeze([
    ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif",
    ".3gp", ".JPG", ".MOV", ".avi", ".bmp", ".gif", ".jpeg", ".jpg", ".m4v", ".mov",
    ".mp4", ".mpg", ".nef", ".pdf", ".png", ".tif", ".tiff", ".wmv"]);

  const acceptedExtensions = new Set(EXIF_IMAGE_EXTENSIONS.map(extension => extension.toLowerCase()));
  const pathFile = {};
  const archivePath = path.join(parametri.destDir, parametri.archive);
  console.log("SourceDir:", parametri.sourceFolders, "\nArchive:", parametri.archive, "\nDestDir:", parametri.destDir, "\nArchivePath:", archivePath);
  try {
    const files = [];
    fs.accessSync(archivePath);
    files.push(...await readSomeRecords(archivePath));
    for (const file of files) {
      pathFile[file.fullname] = file;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  function getAlbumsFromPath(filePath) {
    const dirs = path.normalize(filePath).split(path.sep);
    const patternAnno = /\d{4}/
    const patternMese = /(\d{2})-([A-Z][a-z]+)/;
    const patternGiorno = /\d{2}/;
    if (dirs.length > 3 && dirs[1].match(patternAnno) && dirs[2].match(patternMese) && dirs[3].match(patternGiorno)) {
      const m = dirs[2].match(patternMese);
      //console.log(filePath, "Album from YYYY-MM-DD", dirs[1] + "-" + m[2] + "-" + dirs[3]);
      return [dirs[1] + "-" + m[2] + "-" + dirs[3]];
    }
    if (dirs[1] && dirs[1] === "takeout") {
      if (dirs[2] && dirs[2].match(/Photos from (\d{4})/)) {
        const anno = dirs[2].match(/Photos from (\d{4})/)
        console.log(filePath, "Album from Photos from YYYY", anno[1]);
        return [anno[1]];
      }
      if(dirs[2]) {
        console.log(filePath, "takeout subdir", dirs[2]);
        return [dirs[2]];
      }
    }
    return dirs.slice(1, -1);
  }

  async function visitDirectory(directory, level = "  ") {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const albums = getAlbumsFromPath(directory);
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visitDirectory(filePath, level + "  ");
      } else if (entry.isFile()) {
        // Skip files with extensions not in the accepted list
        if (!entry.isFile() || !acceptedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
        const stats = fs.statSync(filePath);
        const name = path.basename(filePath);
        const normalizedPath = path.normalize(filePath);
        const existingFile = pathFile[filePath];
        if (existingFile) continue;
        const file = {
          fullname: filePath,
          ext: path.extname(name),
          name,
          size: stats.size,
          albums: albums,
          createdAt: stats.ctime.toISOString(),
          hash: null,
          valido: true
        };

        pathFile[file.fullname] = file;
        pendingFiles.push(file);
        if (pendingFiles.length >= 500) {
          await writeArchiveFiles(archivePath, pendingFiles);
          console.log(`${files.length} Wrote ${pendingFiles.length} new files to archive: ${normalizedPath}`);
          pendingFiles = [];
        }
      }
    }
  }
  var pendingFiles = [];
  console.log(`Starting scan in ${parametri.sourceFolders}: ${files.length} existing files`);
  let listDir = [];
  if (typeof parametri.sourceFolders === "string")
    listDir = [parametri.sourceFolders];
  else if (Array.isArray(parametri.sourceFolders))
    listDir = parametri.sourceFolders;

  for (const scanDir of listDir)
    await visitDirectory(scanDir);
  if (pendingFiles.length > 0) await writeArchiveFiles(archivePath, pendingFiles);
  console.log("Scan Completato. Risultati:", Object.keys(pathFile).length);
  return Object.values(pathFile);
}
