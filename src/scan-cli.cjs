#!/usr/bin/env node
/**
 * New CLI scanner - Uses simplified scanner.js with JSON temp files
 * Usage: node scan-cli-new.js <profile-id> [--verbose] [--batch-size=50]
 */


const path = require("node:path");
const { readFile } = require("node:fs/promises");
//const { createScanner, scanFromCLI } = require("./src/scanner.js");
//const { createArchive } = require("./src/archivio.js"); 

const { scanFromCLI } = require("./scanner.cjs");

async function main(profile) {
  console.log("🚀 Avvio scansione...\n");
  await scanFromCLI(profile);
}


/* Start CLI execution */
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scan-cli-new.js <profile-id> [--verbose] [--batch-size=100]");
  console.error("\nExample: node scan-cli-new.js 12345678-1234-1234-1234-123456789012 --verbose");
  process.exit(1);
}
if (args.find(a => a === "-h")) {
  console.error("Usage: node scan-cli-new.js <profile-id> [--verbose] [--batch-size=100] [--min-size=4096] [--name=default]");
  console.error("\nExample: node scan-cli-new.js giuliano --verbose");
  process.exit(1);
}
var destDir = args.find(a => a.startsWith("--dest-dir="))?.split("=")[1] || path.resolve("." + path.sep);

const options = {
  destDir,
  scanDir: args.find(a => a.startsWith("--scan-dir="))?.split("=")[1] || path.resolve(destDir + path.sep + "scan"),
  sourceFolders: args.find(a => a.startsWith("--source-dir="))?.split("=")[1] || "." + path.sep + "",
  verbose: args.includes("--verbose"),
  batchSize: args
    .find(a => a.startsWith("--batch-size="))
    ?.split("=")[1] || "10",
  minSize: args.find(a => a.startsWith("--min-size="))?.split("=")[1] || "4096",
  name: args.find(a => a.startsWith("--name="))?.split("=")[1] || "default",
  extensions: [".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif"],
  archive: args.find(a => a.startsWith("--archive="))?.split("=")[1] || path.join(destDir, "archive.db"),
  backupPath: args.find(a => a.startsWith("--backup-path="))?.split("=")[1] || path.join(destDir, "backup"),
  albumPath: args.find(a => a.startsWith("--album-path="))?.split("=")[1] || path.join(destDir, "album"),
};
const prf = require("./profili.cjs");
const profile = prf.loadProfile(options);
// profile={...options}
console.log(profile);
main(profile).catch(error => {
  console.error("Error scanning files:", error);
  process.exitCode = 1;
});


//prf.saveProfile(profile);