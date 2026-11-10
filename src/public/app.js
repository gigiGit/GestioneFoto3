const appStatus = document.getElementById("app-status");
const profileSelector = document.getElementById("saved-profiles");
const profileForm = document.querySelector("#profile-form");
const jobScan = document.querySelector("#job-scan");
const jobExif = document.querySelector("#job-exif");
const jobAnalisi = document.querySelector("#job-analisi");
const jobPurge = document.querySelector("#job-purge");
const jobThumbnail = document.querySelector("#job-thumbnail");
const jobCopia = document.querySelector("#job-copia");
const previewButton = document.querySelector("#preview");
const previewContainer = document.querySelector("#preview-container");
const profileContainer = document.querySelector("#profile-container");

async function requestJson(url, option) {
    try {
        const response = await fetch(url, option ?? undefined);
        if (!response.ok) {
            throw new Error(`Errore HTTP: ${response.status}`);
        }
        const data = await response.json();
        //console.log('Profili ricevuti:', data);
        return data;
    } catch (error) {
        console.error('Errore chiamata API:', error);
        return [];
    }
}
async function loadProfile(nome) {
    console.log("loadProfile:", nome)
    requestJson("/api/profiles/" + nome, null).then(profilo => {
        console.log(profilo);
        applyProfile(profilo);
    })
}
function applyProfile(profile) {
    ShowPanel("profile-container");
    profileForm.elements.name.value = profile.name || "default";
    profileForm.elements.destDir.value = profile.destDir || "";
    profileForm.elements.scanDir.value = profile.scanDir || "";
    profileForm.elements.sourceFolders.value = profile.sourceFolders || "";
    profileForm.elements.verbose.checked = Boolean(profile.verbose);
    profileForm.elements.batchSize.value = profile.batchSize ?? 10;
    profileForm.elements.minSize.value = profile.minSize ?? 4096;
    profileForm.elements.extensions.value = (profile.extensions || []).join(", ");
    profileForm.elements.archive.value = profile.archive || "";
    profileForm.elements.backupPath.value = profile.backupPath || "";
    profileForm.elements.albumPath.value = profile.albumPath || "";
}

// Inizio selector
requestJson('/api/profiles', null).then(names => {
    console.log(names);
    profileSelector.replaceChildren(new Option("Seleziona un profilo", ""));
    for (const name of names) {
        profileSelector.add(new Option(name, name));
    }
    profileSelector.value = "";
    ShowPanel("profile-container");
});

// definizione listener
profileForm.addEventListener("submit", event => {
    event.preventDefault();
    saveProfile();
});

async function saveProfile() {
    const profileStatus = document.querySelector("#profile-status");
    const profileSave = document.querySelector("#profile-save");
    const elements = profileForm.elements;
    const profile = {
        name: elements.name.value.trim(),
        sourceFolders: elements.sourceFolders.value,
        destDir: elements.destDir.value,
        scanDir: elements.scanDir.value,
        archive: elements.archive.value,
        backupPath: elements.backupPath.value,
        albumPath: elements.albumPath.value,
        batchSize: Number(elements.batchSize.value),
        minSize: Number(elements.minSize.value),
        verbose: elements.verbose.checked,
        extensions: elements.extensions.value.split(",").map(ext => ext.trim()).filter(Boolean)
    };

    profileSave.disabled = true;
    profileStatus.textContent = "Salvataggio in corso...";
    try {
        const response = await fetch("/api/profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(profile)
        });
        const data = await response.json();
        if (!response.ok) {
            profileStatus.textContent = "Errore: " + (data.error || `HTTP ${response.status}`);
            return;
        }
        if (![...profileSelector.options].some(option => option.value === data.name)) {
            profileSelector.add(new Option(data.name, data.name));
        }
        profileSelector.value = data.name;
        applyProfile(data);
        profileStatus.textContent = "Profilo salvato";
    } catch (error) {
        profileStatus.textContent = "Errore: " + error.message;
    } finally {
        profileSave.disabled = false;
    }
}

profileSelector.addEventListener("change", () => {
    console.log("change:", profileSelector);
    if (profileSelector.value) loadProfile(profileSelector.value);
});
jobScan.addEventListener("click", () => startScan("scan"));





async function startScan(type = "scan") {
    if (!profileSelector.value) {
        return;
    }

    const elements = profileForm.elements;
    const profile = {
        name: elements.name.value.trim(),
        sourceFolders: elements.sourceFolders.value,
        destDir: elements.destDir.value,
        scanDir: elements.scanDir.value,
        archive: elements.archive.value,
        backupPath: elements.backupPath.value,
        albumPath: elements.albumPath.value,
        batchSize: Number(elements.batchSize.value),
        minSize: Number(elements.minSize.value),
        verbose: elements.verbose.checked,
        extensions: elements.extensions.value.split(",").map(ext => ext.trim()).filter(Boolean)
    };

    try {
        const response = await fetch(`/api/jobs/${type}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scanDir: profile.scanDir, sourceDir: profile.sourceFolders , archive: profile.archive })
        });
        const data = await response.json();
        console.log(data);
    } catch (error) {
        console.error(error);
    }
}







jobCopia.addEventListener("click", () => {
    requestJson("/api/jobs/copia").then(statusCode => {
        console.log(statusCode);
    })
})


function ShowPanel(id) {
    const panels = document.querySelectorAll(".panel");
    panels.forEach(panel => {
        panel.style.display = "none";
    });
    const panel = document.getElementById(id);
    if (panel) {
        panel.style.display = "block";
    }
}

function preview() {
    const filters = getFilters();
    ShowPanel("preview-container");
    requestJson("/api/preview/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters)
    }).then(data => {
        console.log(data);
    }).catch(error => {
        console.error(error);
    });
}

// ---- Preview: stato ----
const queryForm = document.querySelector("#query-form");
const queryReset = document.querySelector("#query-reset");
const queryStatus = document.querySelector("#query-status");
const navFirst = document.querySelector("#nav-first");
const navPrev = document.querySelector("#nav-prev");
const navNext = document.querySelector("#nav-next");
const navLast = document.querySelector("#nav-last");
const navIndex = document.querySelector("#nav-index");
const navTotal = document.querySelector("#nav-total");
const recordThumbnail = document.querySelector("#record-thumbnail");
const recordData = document.querySelector("#record-data");

const recordSet = {
    records: [],
    current: -1
};

// ---- 1) Filtri ----
function getFilters() {
    const filters = {};
    for (const [key, value] of new FormData(queryForm)) {
        const text = String(value).trim();
        if (text !== "") filters[key] = text;
    }
    if (filters.minSize !== undefined) filters.minSize = Number(filters.minSize);
    if (filters.valido !== undefined) filters.valido = Number(filters.valido);
    return filters;
}
function resetFilters() {
    queryForm.reset();
    setQueryStatus("");
}

// ---- 2) Esecuzione query ----
async function runQuery(filters) { }
function setQueryStatus(message) {
    queryStatus.textContent = message ?? "";
}

// ---- 3) Navigazione ----
function goToRecord(index) {
    const total = recordSet.records.length;
    if (total === 0) {
        recordSet.current = -1;
        updateNavigation();
        clearRecord();
        return;
    }
    recordSet.current = Math.min(Math.max(Number.isInteger(index) ? index : 0, 0), total - 1);
    updateNavigation();
    showRecord(recordSet.records[recordSet.current]);
}
function goFirst() {
    goToRecord(0);
}
function goPrev() {
    goToRecord(recordSet.current - 1);
}
function goNext() {
    goToRecord(recordSet.current + 1);
}
function goLast() {
    goToRecord(recordSet.records.length - 1);
}
function updateNavigation() {
    const total = recordSet.records.length;
    const current = recordSet.current;
    navTotal.textContent = String(total);
    navIndex.max = String(Math.max(total, 1));
    navIndex.value = String(current + 1);
    navIndex.disabled = total === 0;
    navFirst.disabled = navPrev.disabled = total === 0 || current <= 0;
    navNext.disabled = navLast.disabled = total === 0 || current >= total - 1;
}

// ---- 4) Visualizzazione record ----
let detailRequestId = 0;

async function showRecord(record) {
    const { fullname } = record;
    const requestId = ++detailRequestId;
    const detail = await requestJson("/api/records/detail?fullname=" + encodeURIComponent(fullname));
    // Ignora risposte arrivate dopo una navigazione successiva
    if (requestId !== detailRequestId) return;

    if (!detail || Array.isArray(detail)) {
        clearRecord();
        setQueryStatus("Dettaglio non disponibile per " + fullname);
        return;
    }

    for (const cell of recordData.querySelectorAll("[data-field]")) {
        const value = detail[cell.dataset.field];
        cell.textContent = value ?? "";
    }
    // Il thumbnail è salvato come data URL JPEG da scan-thumbnail
    if (typeof detail.thumbnail === "string" && detail.thumbnail.startsWith("data:image/")) {
        recordThumbnail.src = detail.thumbnail;
    } else {
        recordThumbnail.removeAttribute("src");
    }
}
function clearRecord() {
    for (const cell of recordData.querySelectorAll("[data-field]")) {
        cell.textContent = "";
    }
    recordThumbnail.removeAttribute("src");
}

// ---- Listener preview ----
queryForm.addEventListener("submit", event => {
    event.preventDefault();
    runQuery(getFilters());
});
queryReset.addEventListener("click", () => resetFilters());
navFirst.addEventListener("click", () => goFirst());
navPrev.addEventListener("click", () => goPrev());
navNext.addEventListener("click", () => goNext());
navLast.addEventListener("click", () => goLast());
navIndex.addEventListener("change", () => goToRecord(Number(navIndex.value) - 1));
