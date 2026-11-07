const path = require("node:path");
const fs = require("node:fs/promises");
const scanTools = require("./scan-tools.cjs");



async function purge(scanDir) {
  const scanList = scanTools.getScanList(scanDir);
  const listaHash={};
  const listaHashDup={};
  const listaBuona=[];
  for (const scanFile of scanList) {
    const scanFilePath = path.join(scanDir, scanFile);
    const item = JSON.parse(await fs.readFile(scanFilePath, "utf-8"));
    
    item.files.forEach(file=> {
      if(listaHash[file.hash] === undefined || listaHash[file.hash] === null) listaHash[file.hash]=[];
    //console.log(file.fullname,file.hash);
      delete file.thumbnail;
      listaHash[file.hash].push(file);
      //lista.push(file);
    });
   
  }
  for(const hash in listaHash){
    if(listaHash[hash].length>1) {
      console.log(hash);
      var buono=listaHash[hash][0];
      for (var i=1; i<listaHash[hash].length;i++){
        var nome=listaHash[hash][i].name;
        if(buono.name.length>nome.lenght) buono=listaHash[hash][i];
      }
      listaBuona.push(buono);
    }else{
      listaBuona.push(listaHash[hash]);

    }
  }
  //await fs.writeFile(path.join(scanDir,"allHash.json"), JSON.stringify(listaHash, null, 2));
  await fs.writeFile(path.join(scanDir,"scasnsione_0.json"), JSON.stringify(listaBuona, null, 2));
}

module.exports = { purge };

if (require.main === module) {
  const scanDir = process.argv[2] || "F:\\ArchivioFoto\\scan";
  purge(scanDir).catch(error => {
    //console.error("Error processing scan files:", error);
    process.exitCode = 1;
  });
}
