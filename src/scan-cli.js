import { analisiFromArchive,recuperaDataDaNome  } from './services/scan-analyze.js';

    
const verbose = true;
const print = verbose ? console.log : () => { };

function toLocalISOString(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (num) => String(Math.floor(Math.abs(num))).padStart(2, '0');

  const localDate = new Date(date.getTime() + offset * 60 * 1000);
  return localDate.toISOString().slice(0, -1) + `Z`;
}


//recuperaDataDaNome({ name: "20180410_200000.mp4" });
var testo = "Screenshot_20200206-073138.jpg";
//testo="20181227_200345.mp4"
const date=toLocalISOString(new Date(recuperaDataDaNome({ name: testo })))
console.log(testo,date);
await analisiFromArchive("scan\\archive.db", "analisiDate");
//await analisiFromArchive("scan\\archive.db", "analisiAlbum");
