import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readArchiveFiles, writeArchiveFiles, readSomeRecords } from "./scan-archive.cjs";
import { linkAlbum, analisiExif, analisiThumbnail, copia, analisiDate, analisiAlbum, hashFile } from "./runner.js";
export const SCAN_FILE_NAME = "scan.json";
const EXIF_IMAGE_EXTENSIONS = Object.freeze([
  ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif",
  ".3gp", ".JPG", ".MOV", ".avi", ".bmp", ".gif", ".jpeg", ".jpg", ".m4v", ".mov",
  ".mp4", ".mpg", ".nef", ".pdf", ".png", ".tif", ".tiff", ".wmv"]);

const acceptedExtensions = new Set(EXIF_IMAGE_EXTENSIONS.map(extension => extension.toLowerCase()));

export function hashFileLoc(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Carica i record dall'archivio e scansiona ricorsivamente sourceDir.
 * Calcola l'hash dei nuovi file e persiste i risultati solo dopo la scansione.
 * @returns {Promise<{ scanFile: string, files: object[] }>}
 */
export async function scan({ sourceDir, archive, persist = true } = {}) {
  console.log("SourceDir:", sourceDir, "archive:", archive);

  if (!sourceDir || !archive) {
    throw new TypeError("sourceDir e archive sono obbligatori");
  }
  const sourcePath = path.resolve(sourceDir);

  const sourceStats = await fs.stat(sourcePath);
  if (!sourceStats.isDirectory()) {
    throw new TypeError(`sourceDir non è una cartella: ${sourcePath}`);
  }

  const filePaths = [];
  const files = [];
  var pendingFiles = [];
  let modified = false;
  try {
    await fs.access(archive);
    files.push(...await readArchiveFiles(archive, { filters: { rowcount: 10 } }));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  async function visitDirectory(directory, level = "  ") {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        var cnt = filePaths.length;
        process.stdout.write(`${level}Visiting directory: ${filePath}                                                                                   \r`);
        await visitDirectory(filePath, level + "  ");
        process.stdout.write(`${level}Number of files visited in this directory: ${filePaths.length - cnt} Modified: ${modified}                          \r`);
        if (persist && modified && pendingFiles.length > 0) {
          await writeArchiveFiles(archive, pendingFiles);
          console.log(`Wrote ${pendingFiles.length} new files to archive`);
        }
        pendingFiles = [];
        modified = false;
      } else if (entry.isFile()) {
        if (files.find(f => f.fullname === filePath)) continue;
        // Skip files with extensions not in the accepted list
        if (!entry.isFile() || !acceptedExtensions.has(path.extname(entry.name).toLowerCase())) continue;

        filePaths.push(filePath);
        const stats = await fs.stat(filePath);
        const name = path.basename(filePath);
        if (files.find(f => f.fullname === filePath)) continue;
        const file = {
          fullname: filePath,
          ext: path.extname(name),
          name,
          size: stats.size,
          createdAt: stats.ctime.toISOString(),
          hash: await hashFileLoc(filePath)
        };
        if (files.find(f => f.hash === file.hash)) continue;
        modified = true;
        pendingFiles.push(file);
        files.push(file);
      }
    }
  }
  console.log(`Starting scan in source directory: ${files.length} existing files`);
  await visitDirectory(sourcePath);
  if (persist && pendingFiles.length > 0) await writeArchiveFiles(archive, pendingFiles);
  console.log("Scan Completato. Risultati:", files.length);
  return files;
}

// ---- Modalità riga di comando ----
// Uso: node src/services/scanner.js --source-dir=<cartella> --scan-dir=<cartella> [--verbose]

export async function analisiFromArchive(funcName, parametri) {
  let count = 0;
  let errorCount = 0;
  let pendingFiles = [];
  const files = [];
  const dt1 = new Date();
  const archivePath = path.join(parametri.destDir, parametri.archive);
  try {
    fs.accessSync(archivePath);
    files.push(...await readSomeRecords(archivePath, parametri.rowcount ?? 36));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let cb = null;

  let option = parametri || {};
  switch (funcName) {
    case "exif": cb = analisiExif; break;
    case "thumbnail": cb = analisiThumbnail; break;
    case "linkAlbum": cb = linkAlbum; break;
    case "copia": cb = copia; break;
    case "analisiDate": cb = analisiDate;; break;
    case "hash": cb = hashFile; break;
    case "analisiAlbum": cb = analisiAlbum; break;
    default:
      throw new Error(`Invalid function name: ${funcName}`);
  }
  if (!option.count) option.count = 500;

  console.log(`Starting analysis for function: ${funcName}`);
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

export async function scanSource(parametri) {

  const EXIF_IMAGE_EXTENSIONS = Object.freeze([
    ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif",
    ".3gp", ".JPG", ".MOV", ".avi", ".bmp", ".gif", ".jpeg", ".jpg", ".m4v", ".mov",
    ".mp4", ".mpg", ".nef", ".pdf", ".png", ".tif", ".tiff", ".wmv"]);

  const acceptedExtensions = new Set(EXIF_IMAGE_EXTENSIONS.map(extension => extension.toLowerCase()));



  const files = [];
  const pathFile = {};
  const archivePath = path.join(parametri.destDir, parametri.archive);
  console.log("SourceDir:", parametri.sourceFolders, "\nArchive:", parametri.archive, "\nDestDir:", parametri.destDir, "\nArchivePath:", archivePath);
  try {
    fs.accessSync(archivePath);
    files.push(...await readSomeRecords(archivePath));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const file of files) {
    pathFile[file.fullname] = file;
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
