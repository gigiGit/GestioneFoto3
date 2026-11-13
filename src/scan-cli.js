import { analisiFromArchive} from './services/scanner.js';

const profilo = {
  archive: "archive.db",
  sourceFolders: "E:\\",
  destDir: "F:\\ArchivioFoto",
  scanDir: "scan",
  backupPath: "backup",
  albumPath: "albums",
  batchSize: 500,
  minSize: 0,
  verbose: 1,
  simulazione: true,
  force:false,
  formato: "YYYYMMDD",
  rowcount: 100,
  extensions: [".jpg", ".png", ".tif", ".jpeg", ".nef", ".tiff", ".JPG", ".pdf",'.JPG',
    ".avi", ".mov", ".mpg", ".gif", ".wmv", ".3gp", ".mp4", ".m4v", ".bts", ".MOV", ".bmp"]
}

//await analisiFromArchive("thumbnail", profilo).then(result => console.log("Job:", "thumbnail", "\nFiles Elaborati:", result.count, "\nErrori:", result.errorCount,"\nConteggio:",result.files.length,"\nReadTime:", result.readTime,"\nScanTime:", result.scanTime,"\nTotalTime:", result.TotalTime));

for( const job of [ "thumbnail", "exif","analisiDate", "analisiAlbum", "copia", "linkAlbum"]) {
  console.log("---------------------------------------------");
  await analisiFromArchive(job, profilo).then(result => console.log("Job:", job, "\nFiles Elaborati:", result.count, "\nErrori:", result.errorCount,"\nConteggio:",result.files.length,"\nReadTime:", result.readTime,"\nScanTime:", result.scanTime,"\nTotalTime:", result.TotalTime));
} 

