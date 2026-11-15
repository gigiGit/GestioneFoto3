import { analisiFromArchive,scanSource} from './services/scanner.js';

const profilo = {
  archive: "archive-2.db",
  sourceFolders: "E:\\",
  destDir: "C:\\ArchivioFoto",
  scanDir: "scan",
  backupPath: "backup",
  albumPath: "albums",
  batchSize: 500,
  minSize: 0,
  verbose: 2,
  simulazione: true,
  force:false,
  formato: "YYYYMMDD",
  filters: "destPath is null",
  extensions: [".jpg", ".png", ".tif", ".jpeg", ".nef", ".tiff", ".JPG", ".pdf",'.JPG',
    ".avi", ".mov", ".mpg", ".gif", ".wmv", ".3gp", ".mp4", ".m4v", ".bts", ".MOV", ".bmp"]
}
//await scanSource(profilo).then(result => console.log("Scan completed. Files found:", result.length));
const job = "copia";
await analisiFromArchive(job, profilo).then(result => console.log("Job:", job, "\nFiles Elaborati:", result.count, "\nErrori:", result.errorCount,"\nConteggio:",result.files.length,"\nReadTime:", result.readTime,"\nScanTime:", result.scanTime,"\nTotalTime:", result.TotalTime));
/*
for( const job of ["hash", "thumbnail", "exif","analisiDate", "analisiAlbum", "copia", "linkAlbum"]) {
  console.log("---------------------------------------------");
  await analisiFromArchive(job, profilo).then(result => console.log("Job:", job, "\nFiles Elaborati:", result.count, "\nErrori:", result.errorCount,"\nConteggio:",result.files.length,"\nReadTime:", result.readTime,"\nScanTime:", result.scanTime,"\nTotalTime:", result.TotalTime));
} 
*/
