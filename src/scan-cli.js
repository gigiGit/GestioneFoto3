import { analisiFromArchive  } from './services/scanner.js';
import { recuperaDataDaNome ,toLocalISOString} from './services/scan-analyze.js';

//recuperaDataDaNome({ name: "20180410_200000.mp4" });
var testo = "Screenshot_20200206-073138.jpg";
//testo="20181227_200345.mp4"
const date=new Date(recuperaDataDaNome({ name: testo }));
console.log(testo,toLocalISOString(date));
await analisiFromArchive("scan\\archive.db", "linkAlbum",{baseDir:".",formato:"YYYYMMDD"});
//await analisiFromArchive("scan\\archive.db", "analisiAlbum");
