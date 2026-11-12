import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readArchiveFiles, writeArchiveFiles } from "./scan-archive.cjs";
import { analisiExif,analisiThumbnail, analisiDate, analisiAlbum } from "./scan-analyze.js";
export const SCAN_FILE_NAME = "scan.json";
const EXIF_IMAGE_EXTENSIONS = Object.freeze([
  ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif",
  ".3gp",
  ".JPG",
  ".MOV",
  ".avi",
  ".bmp",
  ".gif",
  ".jpeg",
  ".jpg",
  ".m4v",
  ".mov",
  ".mp4",
  ".mpg",
  ".nef",
  ".pdf",
  ".png",
  ".tif",
  ".tiff",
  ".wmv"
]);

const acceptedExtensions = new Set(EXIF_IMAGE_EXTENSIONS.map(extension => extension.toLowerCase()));

export function hashFile(filePath) {
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
  var pendingFiles=[];
  let modified = false;
  try {
    await fs.access(archive);
    files.push(...await readArchiveFiles(archive));
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
        pendingFiles=[];
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
          hash: await hashFile(filePath)
        };
        if(files.find(f => f.hash === file.hash)) continue;
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
async function main() {
  const { values } = parseArgs({
    options: {
      "source-dir": { type: "string" },
      "scan-dir": { type: "string" },
      verbose: { type: "boolean", default: false }
    }
  });

  if (!values["source-dir"] || !values["scan-dir"]) {
    console.error("Uso: node src/services/scanner.js --source-dir=<cartella> --scan-dir=<cartella> [--verbose]");
    process.exitCode = 1;
    return;
  }


  const files = await scan({
    sourceDir: values["source-dir"],
    scanDir: values["scan-dir"]
  });
  console.log("Scan completed:", files.length);
}
export async function copia(file, pendingFiles,{baseDir=".",formato="YYYYMM"}) {
  if(!file.valido) return;
  const data=new Date(file.dt_valida)
  const anno = data.getFullYear();
  const mese = data.toLocaleString('it-IT', { month: 'long' }); // "novembre" (usa 'short' per "nov")
  const giorno = String(data.getDate()).padStart(2, '0');

  const dataFormattata = formato==="YYYYMMDD" ? `${anno}${path.sep}${mese}${path.sep}${giorno}` : `${anno}${path.sep}${mese }`;

  const destinationDir = dataFormattata;
  const destPath = path.join(baseDir,"backup", destinationDir, file.name);
  // Implement the copy functionality here
  try {
    //console.log(`Copying file ${file.fullname} to ${destPath}`);
    //await fs.copyFile(file.fullname, destPath);
    //pendingFiles.push(file);
  } catch (error) {
    console.error(`Error copying file ${file.fullname} to ${destPath}:`, error);
  }
}
export async function linkAlbum(file, pendingFiles,{baseDir=".",formato="YYYYMM"}) {
  if(!file.valido) return;
  const data=new Date(file.dt_valida)
  const anno = data.getFullYear();
  const mese = data.toLocaleString('it-IT', { month: 'long' }); // "novembre" (usa 'short' per "nov")
  const giorno = String(data.getDate()).padStart(2, '0');
  const dataFormattata = formato==="YYYYMMDD" ? `${anno}${path.sep}${mese}${path.sep}${giorno}` : `${anno}${path.sep}${mese }`;
  const destinationDir = dataFormattata;
  const srcPath = path.join(baseDir, "backup",destinationDir, file.name);
  for(const album of file.albums) {
    const destPath = path.join(baseDir, "albums", album, file.name);
    try {
      console.log(`Linking file ${srcPath} to ${destPath}`);
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
}

export async function analisiFromArchive(archive, funcName,parametri) {
  let count = 0;
  let pendingFiles = [];
  const files = [];
  try {
    await fs.access(archive);
    files.push(...await readArchiveFiles(archive));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let cb =null;

  let option = parametri || {};
  switch (funcName) {
    case "analisiDate": cb = analisiDate;; break;
    case "analisiAlbum": cb = analisiAlbum; break;
    case "analisiExif": cb = analisiExif; break;
    case "analisiThumbnail": cb = analisiThumbnail; break;
    case "copia":cb = copia; break;
    case "linkAlbum":cb = linkAlbum; break;
    default:
      throw new Error(`Invalid function name: ${funcName}`);
  }
  if (!option.count) option.count=500;
  for (const file of files) {
    await cb(file,pendingFiles,option);
    count++;
    if (count % option.count === 0) console.log(`Processed ${count} files for ${funcName} - pending writes: ${pendingFiles.length}`);
    if (pendingFiles.length >= option.count) {
      await writeArchiveFiles(archive, pendingFiles);
      pendingFiles = [];
    }
  }
  if (pendingFiles.length > 0) {
    await writeArchiveFiles(archive, pendingFiles);
  }
  return files;
}


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
