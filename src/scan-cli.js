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
  verbose: 0,
  simulazione: true,
  force:false,
  formato: "YYYYMMDD",
  rowcount: -1,
  extensions: [".jpg", ".png", ".tif", ".jpeg", ".nef", ".tiff", ".JPG", ".pdf",'.JPG',
    ".avi", ".mov", ".mpg", ".gif", ".wmv", ".3gp", ".mp4", ".m4v", ".bts", ".MOV", ".bmp"]
}
profilo.force
await analisiFromArchive("thumbnail", profilo).then(result => console.log("Job:", "thumbnail", "Files Elaborati:", result.count, "Errori:", result.errorCount,"Conteggio:",result.files.length,"ReadTime:", result.readTime,"ScanTime:", result.scanTime,"TotalTime:", result.TotalTime));
/*
for( const job of [ "thumbnail", "exif","analisiDate", "analisiAlbum", "copia", "linkAlbum"]) {
  console.log("---------------------------------------------");
  await analisiFromArchive(job, profilo).then(result => console.log("Job:", job, "Files Elaborati:", result.count, "Errori:", result.errorCount,"Conteggio:",result.files.length,"ReadTime:", result.readTime,"ScanTime:", result.scanTime,"TotalTime:", result.TotalTime));
} 
*/
