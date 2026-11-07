/*START module scanner.js*/
const fs = require("node:fs");
function getNextScanNumber(scanDir) {
  try {
    const files = fs.readdirSync(scanDir);
    const scanFiles = files.filter(f => /^scansione_\d+\.json$/.test(f));

    if (scanFiles.length === 0) return 1;

    const numbers = scanFiles.map(f => {
      const match = f.match(/scansione_(\d+)\.json/);
      return match ? parseInt(match[1], 10) : 0;
    });

    return Math.max(...numbers) + 1;
  } catch (error) {
    if (error.code === "ENOENT") return 1;
    throw error;
  }
}


function getScanList(scanDir) {
  try {
    const files = fs.readdirSync(scanDir);
    const scanFiles = files.filter(f => /^scansione_\d+\.json$/.test(f));
    return scanFiles;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}


module.exports = {
  getNextScanNumber,
  getScanList
};
