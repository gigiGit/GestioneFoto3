import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { openDatabase} from "./scan-analyze.js"
import { initDB, readArchiveFiles } from "../scan-archive.cjs";
export const SCAN_FILE_NAME = "scan.json";
const EXIF_IMAGE_EXTENSIONS = Object.freeze([
  ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif"
]);

const acceptedExtensions = new Set(EXIF_IMAGE_EXTENSIONS.map(extension => extension.toLowerCase()));

function run(db, sql, values = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, values, function (error) {
      if (error) reject(error);
      else resolve(this.changes);
    });
  });
}

async function upsertFiles(db, files) {
  const columns = [
    "hash", "fullname", "name", "ext", "dt_valida", "size", "createdAt",
    "exifCreateDate", "exifDateTimeOriginal", "exifGPSDateStamp", "exifModifyDate",
    "thumbnail", "albums", "valido"
  ];
  const assignments = columns.map(column => `${column} = COALESCE(?, ${column})`).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  await run(db, "BEGIN IMMEDIATE");
  try {
    for (const file of files) {
      const values = columns.map(column => column === "albums" && Array.isArray(file.albums)
        ? JSON.stringify(file.albums)
        : file[column] ?? null);
      const changes = await run(db, `UPDATE raw_files SET ${assignments} WHERE fullname = ?`, [...values, file.fullname]);
      if (changes === 0) {
        await run(db, `INSERT INTO raw_files (${columns.join(", ")}) VALUES (${placeholders})`, values);
      }
    }
    await run(db, "COMMIT");
  } catch (error) {
    await run(db, "ROLLBACK");
    throw error;
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

/**
 * Carica i record dall'archivio e scansiona ricorsivamente sourceDir.
 * Calcola l'hash dei nuovi file e salva i record nel database.
 * @returns {Promise<{ scanFile: string, files: object[] }>}
 */
export async function scan({ sourceDir, scanDir,archive } = {}) {
  if (!sourceDir || !scanDir) {
    throw new TypeError("sourceDir e scanDir sono obbligatori");
  }
  const sourcePath = path.resolve(sourceDir);
  const outputPath = path.resolve(scanDir);
  
  const sourceStats = await fs.stat(sourcePath);
  if (!sourceStats.isDirectory()) {
    throw new TypeError(`sourceDir non è una cartella: ${sourcePath}`);
  }
  // Evita che il file di output finisca dentro la scansione stessa
  const relativeOutput = path.relative(sourcePath, outputPath);
  const isOutside = relativeOutput === ".." || relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput);
  if (!isOutside) {
    throw new Error("scanDir non può trovarsi dentro sourceDir");
  }
  const scanFile = path.join(outputPath, SCAN_FILE_NAME);
  await fs.mkdir(outputPath, { recursive: true });
  const db = await openDatabase(archive);
  
  const filePaths = [];
  const files = [];
  let modified = false;
  async function visitDirectory(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        var cnt=filePaths.length;
        console.log(`Visiting directory: ${filePath}`);
        await visitDirectory(filePath);
        console.log(`Number of files visited in this directory: ${filePaths.length-cnt} Modified: ${modified} `);
        if(modified) {
        //  await fs.writeFile(scanFile, JSON.stringify({ exif: false,count: files.length,  files }, null, 2));
          await upsertFiles(db, files);
          modified = false;
        }

      } else if (entry.isFile()) {
        if (!entry.isFile() || !acceptedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
        modified=true;
        filePaths.push(filePath);
        const stats = await fs.stat(filePath);
        const name = path.basename(filePath);
        if (files.find(f => f.fullname === filePath)) continue;
        files.push({
        fullname: filePath,
        ext: path.extname(name),
        name,
        size: stats.size,
        createdAt: stats.ctime.toISOString(),
        hash:await hashFile(filePath)
      });

      }
    }
  }
  try {
    await initDB(db);
    for (const record of await readArchiveFiles(archive)) {
      files.push(record);
    }
    console.log(`Starting scan in source directory: ${files.length} existing files`);
    await visitDirectory(sourcePath);
    //await fs.writeFile(scanFile, JSON.stringify({ exif: false,  files }, null, 2));
    await upsertFiles(db, files);
    console.log("Scan results:", files.length);
    return {scanFile,files};
  } finally {
    await new Promise((resolve, reject) => {
      db.close(error => error ? reject(error) : resolve());
    });
  }
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

  
  const {scanFile, files} = await scan({
    sourceDir: values["source-dir"],
    scanDir: values["scan-dir"]
  });
  console.log("Scan completed:", files.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
