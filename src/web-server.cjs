const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const { scanFromCLI } = require("./scanner.cjs");
const { readExifFromScanFiles } = require("./scan-exif.cjs");
const { analisi } = require("./scan-analyze.cjs");
const { generateThumbnailsFromScanFiles } = require("./scan-thumbnail.cjs");
const { archiveScanFiles, listArchivedFiles, updateArchivedFile } = require("./scan-archive.cjs");
const { purge } = require("./scan-purge.cjs");
const fs_tools  =require("./fs-tools.cjs")
const profiles = require("./profili.cjs");

const WEB_DIR = path.join(__dirname, "web");
const PHASES = ["scan", "exif", "analyze", "thumbnail", "archive"];
const PHASE_LABELS = {
  scan: "Scansione",
  exif: "Lettura EXIF",
  analyze: "Analisi date",
  thumbnail: "Generazione miniature",
  archive: "Archiviazione SQLite"
};
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};
const port = Number(process.env.GESTIONEFOTO_WEB_PORT || 3080);
let currentJob = null;

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(data));
}

function isLocalRequest(request) {
  const host = (request.headers.host || "").toLowerCase();
  const allowedHosts = new Set([
    `localhost:${port}`,
    `127.0.0.1:${port}`
  ]);
  if (!allowedHosts.has(host)) return false;

  const origin = request.headers.origin;
  if (origin && origin !== `http://${host}`) return false;
  const fetchSite = request.headers["sec-fetch-site"];
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 32 * 1024) throw new RangeError("Request body exceeds 32 KB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validateProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new TypeError("Profilo non valido");
  }
  const name = profile.name;
  if (typeof name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)) {
    throw new TypeError("Nome profilo non valido (usa lettere, numeri, punti, trattini o underscore)");
  }

  const stringFields = ["destDir", "scanDir", "sourceFolders", "archive", "backupPath", "albumPath"];
  for (const field of stringFields) {
    if (typeof profile[field] !== "string" || !profile[field].trim()) {
      throw new TypeError(`Il campo ${field} è obbligatorio`);
    }
  }

  const batchSize = Number(profile.batchSize);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 10000) {
    throw new RangeError("La dimensione del blocco deve essere compresa tra 1 e 10000");
  }
  const minSize = Number(profile.minSize);
  if (!Number.isSafeInteger(minSize) || minSize < 0) {
    throw new RangeError("La dimensione minima deve essere un numero intero non negativo");
  }
  if (typeof profile.verbose !== "boolean") {
    throw new TypeError("Il campo verbose deve essere booleano");
  }
  if (!Array.isArray(profile.extensions) || profile.extensions.length === 0 ||
      profile.extensions.some(extension => typeof extension !== "string" || !/^\.[a-z0-9]{1,10}$/i.test(extension))) {
    throw new TypeError("Inserisci almeno un’estensione valida, ad esempio .jpg");
  }

  return {
    destDir: profile.destDir.trim(),
    scanDir: profile.scanDir.trim(),
    sourceFolders: profile.sourceFolders.trim(),
    verbose: profile.verbose,
    batchSize,
    minSize,
    name,
    extensions: [...new Set(profile.extensions.map(extension => extension.toLowerCase()))],
    archive: profile.archive.trim(),
    backupPath: profile.backupPath.trim(),
    albumPath: profile.albumPath.trim()
  };
}

function validateJob(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TypeError("Richiesta di elaborazione non valida");
  }
  const profile = validateProfile(body.profile);
  if (!Array.isArray(body.phases) || body.phases.length === 0 ||
      body.phases.some(phase => !PHASES.includes(phase)) ||
      new Set(body.phases).size !== body.phases.length) {
    throw new TypeError("Seleziona almeno una fase valida");
  }

  return {
    profile,
    scanDirectory: path.resolve(profile.scanDir),
    sourceDirectory: path.resolve(profile.sourceFolders),
    archivePath: path.resolve(profile.archive),
    phases: PHASES.filter(phase => body.phases.includes(phase))
  };
}

function appendJobLog(job, message) {
  job.logs.push({ at: new Date().toISOString(), message });
  if (job.logs.length > 300) job.logs.shift();
}

async function executeJob(job, options) {
  job.status = "running";
  job.startedAt = new Date().toISOString();
  try {
    await fs.mkdir(options.scanDirectory, { recursive: true });
    console.log(options.phases);
    for (const phase of options.phases) {
      job.phase = phase;
      appendJobLog(job, `${PHASE_LABELS[phase]}: avvio`);
      console.log(phase)
      if (phase === "scan") {
        await scanFromCLI({
          sourceFolders: options.sourceDirectory,
          batchSize: options.profile.batchSize,
          minSize: options.profile.minSize,
          extensions: options.profile.extensions,
          scanDir: options.scanDirectory,
          verbose: options.profile.verbose,
          onProgress: message => appendJobLog(job, message)
        });
      } else if (phase === "exif") {
        await readExifFromScanFiles(options.scanDirectory);
      } else if (phase === "analyze") {
        await analisi(options.scanDirectory);
      } else if (phase === "thumbnail") {
        await generateThumbnailsFromScanFiles(options.scanDirectory);
      } else if (phase === "purge") {
        await purge(options.scanDirectory,{
          onLog: message => appendJobLog(job, message)
        });
      } else if (phase === "archive") {
        await archiveScanFiles(options.scanDirectory, {
          archivePath: options.archivePath,
          onLog: message => appendJobLog(job, message)
        });
      }
      appendJobLog(job, `${PHASE_LABELS[phase]}: completata`);
    }
    job.status = "completed";
    job.phase = null;
    appendJobLog(job, "Pipeline completata");
  } catch (error) {
    job.status = "failed";
    job.error = error.message;
    appendJobLog(job, `Errore: ${error.message}`);
  } finally {
    job.finishedAt = new Date().toISOString();
  }
}

async function serveStatic(request, response, pathname) {
  const fileName = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!["index.html", "app.js", "styles.css"].includes(fileName)) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  try {
    const body = await fs.readFile(path.join(WEB_DIR, fileName));
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(fileName)],
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Unable to load web interface: ${error.message}`);
  }
}

const server = http.createServer(async (request, response) => {
  if (!isLocalRequest(request)) {
    sendJson(response, 403, { error: "Accesso consentito solo da localhost" });
    return;
  }
  const url = new URL(request.url, `http://${request.headers.host}`);
  console.log("Richiesta: ",url.pathname);
  if (request.method === "GET" && url.pathname === "/api/profiles") {
    
    try {
      sendJson(response, 200, {
        profiles: await profiles.listProfiles(),
        defaults: profiles.createDefaultProfile()
      });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/profiles/")) {
    try {
      const name = decodeURIComponent(url.pathname.slice("/api/profiles/".length));
      const defaults = profiles.createDefaultProfile(name);
      const saved = await profiles.getProfile(name);
      sendJson(response, 200, { profile: { ...defaults, ...saved, name } });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/profiles") {
    try {
      const body = await readJson(request);
      const profile = validateProfile(body.profile);
      profiles.saveProfile(profile);
      sendJson(response, 200, { profile });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/sceltaDir") {
    try {
      var dir=await fs_tools.scegliCartellaNativa();
      
      sendJson(response, 200, { selDir:dir });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/preview") {
    try {
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          typeof body.archivePath !== "string" || !body.archivePath.trim()) {
        throw new TypeError("Seleziona il database archivio nel profilo");
      }

      const filters = body.filters || {};
      if (typeof filters !== "object" || Array.isArray(filters)) {
        throw new TypeError("Filtri preview non validi");
      }
      const query=filters.dati;
      const search = typeof filters.search === "string" ? filters.search.trim() : "";
      const extension = typeof filters.extension === "string" ? filters.extension.trim().toLowerCase() : "";
      const dateFrom = typeof filters.dateFrom === "string" ? filters.dateFrom : "";
      const dateTo = typeof filters.dateTo === "string" ? filters.dateTo : "";
      const offset = Number(body.offset ?? 0);
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const isValidDate = value => !value || (
        datePattern.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
      );
      if (search.length > 256 ||
          (extension && !/^\.[a-z0-9]{1,10}$/i.test(extension)) ||
          !isValidDate(dateFrom) || !isValidDate(dateTo) ||
          (dateFrom && dateTo && dateFrom > dateTo) ||
          !Number.isSafeInteger(offset) || offset < 0 || offset > 100000000) {
        throw new TypeError("Uno o più filtri preview non sono validi");
      }
      console.log("/api/preview",{
        search,
        extension,
        dateFrom,
        dateTo,
        limit: 36,
        offset,query
      });
      if(query){
      const result = await listArchivedFiles(path.resolve(body.archivePath), {
        search,
        extension,
        dateFrom,
        dateTo,
        limit: 36,
        offset
      });
      sendJson(response, 200, { ...result, offset, limit: 36 });
    }else{
      sendJson(response, 200, { ...[], offset, limit: 0 });
    }
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/preview/update") {
    try {
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          typeof body.archivePath !== "string" || !body.archivePath.trim()) {
        throw new TypeError("Seleziona il database archivio nel profilo");
      }

      const { recordId, dtValida, albums } = body;
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const isValidDate = value => !value || (
        datePattern.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
      );
      if (!Number.isSafeInteger(recordId) || recordId < 1 ||
          typeof dtValida !== "string" || !isValidDate(dtValida) ||
          !Array.isArray(albums) || albums.length > 100 ||
          albums.some(album => typeof album !== "string" || !album.trim() || album.trim().length > 128)) {
        throw new TypeError("Data valida o lista di album non validi");
      }

      const record = await updateArchivedFile(path.resolve(body.archivePath), {
        recordId,
        dtValida,
        albums: [...new Set(albums.map(album => album.trim()))]
      });
      sendJson(response, 200, { record });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/jobs/current") {
    sendJson(response, 200, { job: currentJob });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/jobs") {
    if (currentJob?.status === "queued" || currentJob?.status === "running") {
      sendJson(response, 409, { error: "Un’elaborazione è già in corso" });
      return;
    }

    try {
      const options = validateJob(await readJson(request));
      currentJob = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        status: "queued",
        phase: null,
        logs: [],
        error: null,
        startedAt: null,
        finishedAt: null
      };
      setImmediate(() => executeJob(currentJob, options));
      sendJson(response, 202, { job: currentJob });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
    await serveStatic(request, response, url.pathname);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Gestione Foto web disponibile su http://127.0.0.1:${port}`);
});

server.on("error", error => {
  console.error("Unable to start Gestione Foto web server:", error);
  process.exitCode = 1;
});
