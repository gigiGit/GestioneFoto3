
const appStatus = document.getElementById("app-status");
const profileSelector = document.getElementById("saved-profiles");
const profileForm = document.querySelector("#profile-form");
const jobScan = document.querySelector("#job-scan");
const jobExif = document.querySelector("#job-exif");
const jobAnalisi = document.querySelector("#job-analisi");
const jobAlbum = document.querySelector("#job-album");
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
function getProfileData() {
    const elements = profileForm.elements;
    return {
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
}
async function saveProfile() {
    const profileStatus = document.querySelector("#profile-status");
    const profileSave = document.querySelector("#profile-save");
    const elements = profileForm.elements;
    const profile = getProfileData();

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





function disableJobButtons(disabled) {
    jobScan.disabled = disabled;
    jobExif.disabled = disabled;
    jobAnalisi.disabled = disabled;
    jobThumbnail.disabled = disabled;
    jobCopia.disabled = disabled;
    jobAlbum.disabled = disabled;
}
jobScan.addEventListener("click", () => startJob("scan"));
jobExif.addEventListener("click", () => startJob("exif"));
jobAnalisi.addEventListener("click", () => startJob("analisi"));
jobThumbnail.addEventListener("click", () => startJob("thumbnail"));
jobCopia.addEventListener("click", () => startJob("copia"));
jobAlbum.addEventListener("click", () => startJob("album"));
//jobBackup.addEventListener("click", () => startJob("backup"));
function startJob(type) {
    disableJobButtons(true);
    const parametri = getProfileData();

    requestJson("/api/jobs/runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: parametri, runner: type })
    }).then(message => {
        console.log("Elaborati:", message.count);
        console.log("Errori:", message.errorCount);
    }).finally(() => disableJobButtons(false));
}


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
    ShowPanel("preview-container");
    runQuery(getFilters());
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
const duplicateSelectButton = document.querySelector("#duplicate-select");
const recordSaveButton = document.querySelector("#record-save");
const recordSaveStatus = document.querySelector("#record-save-status");

const recordSet = {
    records: [],
    current: -1
};
let detailRequestId = 0;

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
async function runQuery(filters) {
    setQueryStatus("Ricerca in corso...");
    const parametri = getProfileData();
    try {
        const response = await fetch("/api/preview/list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parametri)
        });
        if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
        const records = await response.json();
        console.log("Letti dal server", records.length);
        if (!Array.isArray(records)) throw new Error("Risposta non valida");
        recordSet.records = records;
        recordSet.current = -1;
        if (records.length === 0) {
            goToRecord(-1);
            setQueryStatus("Nessun record trovato");
            return;
        }
        setQueryStatus(`${records.length} record trovati`);
        goToRecord(0);
    } catch (error) {
        console.error("Errore durante la ricerca:", error);
        recordSet.records = [];
        goToRecord(-1);
        setQueryStatus("Errore durante la ricerca");
    }
}
function setQueryStatus(message) {
    queryStatus.textContent = message ?? "";
}

// ---- 3) Navigazione ----
function goToRecord(index) {
    const total = recordSet.records.length;
    if (total === 0) {
        recordSet.current = -1;
        detailRequestId++;
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
async function showRecord(record) {
    const requestId = ++detailRequestId;
    clearRecord();
    try {
        const detailParams = new URLSearchParams({ fullname: record.fullname, profileName: profileSelector.value });
        requestJson("/api/records/detail?", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fullname: record.fullname })
        });
        const response = await fetch("/api/records/detail?" + detailParams);
        if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
        const detail = await response.json();
        console.log(detail);
        for (const cell of recordData.querySelectorAll("[data-field]")) {
            const value = detail[cell.dataset.field];
            if (cell.type === "checkbox") {
                cell.checked = value === null || value === undefined || value === "" || value === true || Number(value) === 1;
            } else if (cell.type === "datetime-local") {
                cell.value = toDateTimeLocal(value);
            } else {
                cell.textContent = Array.isArray(value) ? value.join(", ") : value ?? "";
            }
        }
        if (typeof detail.thumbnail === "string" && detail.thumbnail.startsWith("data:image/")) {
            recordThumbnail.src = detail.thumbnail;
        }
        duplicateSelectButton.disabled = Number(detail.duplicateCount) < 2;
        duplicateSelectButton.textContent = Number(detail.valido) === 1
            ? "Già selezionato come valido"
            : "Seleziona come unico valido";
        recordSaveButton.disabled = true;
        recordSaveStatus.textContent = "";
    } catch (error) {
        if (requestId !== detailRequestId) return;
        console.error("Errore caricamento dettaglio:", error);
        setQueryStatus("Dettaglio non disponibile per il record selezionato");
    }
}
function clearRecord() {
    for (const cell of recordData.querySelectorAll("[data-field]")) {
        if (cell.type === "checkbox") cell.checked = false;
        else if (cell.type) cell.value = "";
        else cell.textContent = "";
    }
    recordThumbnail.removeAttribute("src");
    duplicateSelectButton.disabled = true;
    recordSaveButton.disabled = true;
    recordSaveStatus.textContent = "";
}

function toDateTimeLocal(value) {
    if (value === null || value === undefined || value === "") return "";
    const text = String(value).trim();
    const exifDate = /^(\d{4})[:/](\d{2})[:/](\d{2})[ T](\d{2}):(\d{2})/.exec(text);
    if (exifDate) return `${exifDate[1]}-${exifDate[2]}-${exifDate[3]}T${exifDate[4]}:${exifDate[5]}`;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return text;

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "";
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

async function saveRecord() {
    const record = recordSet.records[recordSet.current];
    if (!record || recordSaveButton.disabled) return;

    const dateValue = recordData.querySelector('[data-field="dt_valida"]').value;
    const valido = recordData.querySelector('[data-field="valido"]').checked;
    recordSaveButton.disabled = true;
    recordSaveStatus.textContent = "Salvataggio...";
    try {
        const response = await fetch("/api/records/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                profileName: profileSelector.value,
                fullname: record.fullname,
                dtValida: dateValue || null,
                valido
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Errore HTTP: ${response.status}`);
        if (recordSet.records[recordSet.current]?.fullname === record.fullname) {
            await showRecord(record);
        }
        recordSaveStatus.textContent = "Modifiche salvate";
    } catch (error) {
        console.error("Errore salvataggio record:", error);
        recordSaveStatus.textContent = error.message || "Errore durante il salvataggio";
        recordSaveButton.disabled = false;
    }
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
recordData.addEventListener("input", () => { recordSaveButton.disabled = false; });
recordData.addEventListener("change", () => { recordSaveButton.disabled = false; });
recordSaveButton.addEventListener("click", () => saveRecord());
