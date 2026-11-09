import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const SCAN_FILE_NAME = "scan-1.json";
const EXIF_IMAGE_EXTENSIONS = Object.freeze([
  ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif"
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
 * Legge ricorsivamente tutti i file di sourceDir, ne calcola l'hash e scrive scanDir/scan-1.json.
 * Se scan-1.json esiste già, riusa gli hash dei file invariati (stesso percorso, dimensione e ctime).
 * Se signal viene interrotto durante il calcolo degli hash, salva un file parziale (complete: false).
 * @returns {Promise<{ count: number, reused: number, complete: boolean, scanFile: string | null }>}
 */
export async function scan({ sourceDir, scanDir } = {}) {
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

  const filePaths = [];
  const files = [];

  async function visitDirectory(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        var cnt=filePaths.length;
        console.log(`Visiting directory: ${filePath}`);
        await visitDirectory(filePath);
        console.log(`Number of files visited in this directory: ${filePaths.length-cnt}`);
      } else if (entry.isFile()) {
        if (!entry.isFile() || !acceptedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
        filePaths.push(filePath);
        const stats = await fs.stat(filePath);
        const name = path.basename(filePath);
      files.push({
        fullname: filePath,
        ext: path.extname(name),
        name,
        size: stats.size,
        createdAt: stats.ctime.toISOString(),
        hash:null //await hashFile(filePath)
      });

      }
    }
  }

  const scanFile = path.join(outputPath, SCAN_FILE_NAME);
  const count = files.length;
  await visitDirectory(sourcePath);
  await fs.mkdir(outputPath, { recursive: true });
  const tempFile = scanFile + ".tmp";
  await fs.writeFile(tempFile, JSON.stringify({ exif: false,  files }, null, 2));
  await fs.rename(tempFile, scanFile);
  console.log("Scan results:", files);
  return {scanFile,files};
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

  
  const files= await scan({
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
