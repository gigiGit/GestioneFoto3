
import express from 'express';
const router = express.Router();
import fs from 'fs';
import path from 'path';
const profili = {};
// API di verifica server
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server operativo',
        version: '1.0.0'
    });
});

// Endpoint predisposto per future API
router.get('/status', (req, res) => {
    res.json({
        success: true,
        message: 'API disponibili'
    });
});

import {
    createDefaultProfile,
    getProfile,
    listProfiles,
    loadProfile,
    saveProfile
} from '../services/profileManager.js';
router.get("/profiles", async (req, res) => {
    console.log("/profiles")
    const defaultProf = createDefaultProfile();
    const profiliName = [];
    listProfiles().then(profiliFile => {
        profiliFile.forEach(profiloFile => {
            const Jprofilo = fs.readFileSync(path.join(profiloFile.parentPath, profiloFile.name));
            const profilo = JSON.parse(Jprofilo);
            profiliName.push(profilo.name);
            profili[profilo.name] = { ...defaultProf, ...profilo };
        });
        res.json(profiliName);
    });
});
router.get("/profiles/:name", async (req, res) => {
    const name = req.params.name;
    console.log("profilo richiesto: ", name)
    try {
        res.json(profili[name]);
    } catch (error) {
        res.json({ error: error.message });
    }
});

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PROFILE_PATH_FIELDS = ["sourceFolders", "destDir", "scanDir", "archive", "backupPath", "albumPath"];

// Restituisce { profile } normalizzato oppure { error }
function parseProfile(body) {
    if (!body || typeof body !== "object") return { error: "Profilo non valido" };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!PROFILE_NAME_PATTERN.test(name)) return { error: "Nome profilo non valido" };

    const profile = { name };
    for (const field of PROFILE_PATH_FIELDS) {
        const value = typeof body[field] === "string" ? body[field].trim() : "";
        if (!value) return { error: `Campo ${field} obbligatorio` };
        profile[field] = value;
    }

    const batchSize = Number(body.batchSize);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10000) return { error: "batchSize non valido" };
    const minSize = Number(body.minSize);
    if (!Number.isInteger(minSize) || minSize < 0) return { error: "minSize non valido" };
    profile.batchSize = batchSize;
    profile.minSize = minSize;
    profile.verbose = Boolean(body.verbose);

    const extensions = Array.isArray(body.extensions) ? body.extensions : String(body.extensions ?? "").split(",");
    profile.extensions = extensions
        .map(ext => String(ext).trim().toLowerCase())
        .filter(Boolean)
        .map(ext => (ext.startsWith(".") ? ext : "." + ext));
    if (profile.extensions.length === 0) return { error: "Indicare almeno un'estensione" };

    return { profile };
}

router.post("/profiles", async (req, res) => {
    const { profile, error } = parseProfile(req.body);
    if (error) return res.status(400).json({ error });
    try {
        const existing = (await loadProfile(profile.name)) ?? {};
        const saved = await saveProfile({ ...existing, ...profile });
        profili[saved.name] = { ...createDefaultProfile(), ...saved };
        res.json(saved);
    } catch (err) {
        console.error("/profiles save:", err);
        res.status(500).json({ error: "Errore durante il salvataggio del profilo" });
    }
});

// ---- Job: scan ----
import { scan ,SCAN_FILE_NAME} from '../services/scanner.js';
import { analisi } from '../services/scan-analyze.js';

var listFiles = [];
router.post("/jobs/scan", (req, res) => {
    console.log("Starting scan with sourceDir:", req.body);
      const outputPath = path.resolve(req.body.scanDir);
      const scanFile = path.join(outputPath, SCAN_FILE_NAME);
      let existingScan = {};
      try {
        const data = fs.readFileSync(scanFile, "utf-8");
        existingScan = JSON.parse(data);
        listFiles = existingScan.files;
      } catch (error) {
        // Ignore if the file doesn't exist or is invalid
      }      
    
    scan({ sourceDir: req.body.sourceDir, scanDir: req.body.scanDir, archive: req.body.archive })
        .then(({scanFile, files}) => {
            console.log("Scan completed:", files.length);
            analisi(scanFile, files);
            listFiles = files;
        }).catch(error => res.status(500).json({ error: error.message })).finally(() => {
            console.log("List of files:", listFiles.length);
        });
});

// ---- Archivio: ricerca record ----
// Da implementare: restituisce un array di oggetti con almeno { fullname }
async function searchArchive(filters) {
    return [];
}
// Da implementare: restituisce il record completo di raw_files o null
async function getArchiveRecord(fullname) {
    return null;
}

const ORDER_BY_COLUMNS = new Set(["dt_valida", "name", "size"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseRecordFilters(query) {
    const filters = {};
    const text = value => (typeof value === "string" ? value.trim() : "");

    if (text(query.name)) filters.name = text(query.name);
    if (text(query.ext)) filters.ext = text(query.ext).toLowerCase();
    if (text(query.album)) filters.album = text(query.album);
    if (DATE_PATTERN.test(text(query.dateFrom))) filters.dateFrom = text(query.dateFrom);
    if (DATE_PATTERN.test(text(query.dateTo))) filters.dateTo = text(query.dateTo);

    const minSize = Number(text(query.minSize));
    if (text(query.minSize) && Number.isInteger(minSize) && minSize >= 0) filters.minSize = minSize;

    if (text(query.valido) === "0" || text(query.valido) === "1") filters.valido = Number(query.valido);

    filters.orderBy = ORDER_BY_COLUMNS.has(text(query.orderBy)) ? text(query.orderBy) : "dt_valida";
    return filters;
}
router.post("/preview/list", async (req, res) => {
    try {
        console.log("Preview list requested",req.body);        
        res.json(listFiles.map(file => ({ fullname: file.fullname })));
    } catch (error) {
        console.error("/preview/list:", error);
        res.status(500).json({ error: "Errore durante la ricerca" });
    }
});

router.get("/records", async (req, res) => {
    try {
        const records = await searchArchive(parseRecordFilters(req.query));
        res.json(records);
    } catch (error) {
        console.error("/records:", error);
        res.status(500).json({ error: "Errore durante la ricerca" });
    }
});

router.get("/records/detail", async (req, res) => {
    const fullname = typeof req.query.fullname === "string" ? req.query.fullname : "";
    if (!fullname) {
        return res.status(400).json({ error: "Parametro fullname obbligatorio" });
    }
    try {
        const record = await getArchiveRecord(fullname);
        if (!record) {
            return res.status(404).json({ error: "Record non trovato" });
        }
        res.json(record);
    } catch (error) {
        console.error("/records/detail:", error);
        res.status(500).json({ error: "Errore durante la lettura del record" });
    }
});
export default router;