const profileForm = document.querySelector("#profile-form");
const form = document.querySelector("#job-form");
const startButton = document.querySelector("#start-button");
const statusLabel = document.querySelector("#job-status");
const phaseStatus = document.querySelector("#phase-status");
const log = document.querySelector("#job-log");
const profileStatus = document.querySelector("#profile-status");
const profileSelector = document.querySelector("#saved-profiles");
const previewContent = document.querySelector("#prv-content");
const previewStatus = document.querySelector("#preview-status");
const previewSearch = document.querySelector("#preview-search");
const previewExtension = document.querySelector("#preview-extension");
const previewDateFrom = document.querySelector("#preview-date-from");
const previewDateTo = document.querySelector("#preview-date-to");
const previewPreviousButton = document.querySelector("#preview-previous-button");
const previewNextButton = document.querySelector("#preview-next-button");

let lastLogCount = 0;
let polling = false;
let profileDefaults;
let previewOffset = 0;
let previewTotal = 0;
let previewLoading = false;
let previewRecords = [];
let selectedPreviewRecordId = null;
const previewPageSize = 36;

function readProfileForm() {
  const data = new FormData(profileForm);
  return {
    name: data.get("name").trim(),
    destDir: data.get("destDir").trim(),
    scanDir: data.get("scanDir").trim(),
    sourceFolders: data.get("sourceFolders").trim(),
    verbose: data.has("verbose"),
    batchSize: Number(data.get("batchSize")),
    minSize: Number(data.get("minSize")),
    extensions: data.get("extensions").split(",").map(extension => extension.trim()).filter(Boolean),
    archive: data.get("archive").trim(),
    backupPath: data.get("backupPath").trim(),
    albumPath: data.get("albumPath").trim()
  };
}

function applyProfile(profile) {
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

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Richiesta non riuscita");
  return data;
}

function hasPreviewThumbnail(record) {
  return typeof record.thumbnail === "string" &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(record.thumbnail);
}

function dateInputValue(value) {
  if (!value) return "";
  const date = String(value).replace(/^(\d{4}):/, "$1-").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function renderPreviewRecord(record, index) {
  const card = document.createElement("button");
  card.className = "preview-record";
  card.type = "button";
  card.dataset.recordIndex = String(index);
  card.setAttribute("aria-pressed", String(index === 0));

  if (hasPreviewThumbnail(record)) {
    const image = document.createElement("img");
    image.src = record.thumbnail;
    image.alt = "";
    card.append(image);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "preview-no-thumbnail";
    placeholder.textContent = "Nessuna miniatura";
    card.append(placeholder);
  }

  const details = document.createElement("div");
  details.className = "preview-record-details";
  const name = document.createElement("strong");
  name.className = "preview-record-name";
  name.textContent = record.name || "Senza nome";
  const filePath = document.createElement("span");
  filePath.className = "preview-record-path";
  filePath.textContent = record.fullname || "";
  const metadata = document.createElement("span");
  const date = record.dt_valida ? new Date(record.dt_valida).toLocaleDateString() : "Data non disponibile";
  const size = Number.isFinite(record.size) ? `${record.size.toLocaleString()} byte` : "Dimensione non disponibile";
  metadata.textContent = [record.ext, date, size].filter(Boolean).join(" · ");
  details.append(name, filePath, metadata);
  card.append(details);
  return card;
}

function renderPreviewDetails(record) {
  const details = document.createElement("section");
  details.className = "preview-record-inspector";
  details.setAttribute("aria-label", "Dettagli del record selezionato");

  const heading = document.createElement("h3");
  heading.textContent = record.name || "Record selezionato";
  details.append(heading);

  if (hasPreviewThumbnail(record)) {
    const image = document.createElement("img");
    image.className = "preview-record-thumbnail";
    image.src = record.thumbnail;
    image.alt = `Miniatura di ${record.name || "immagine"}`;
    details.append(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "preview-record-thumbnail preview-no-thumbnail";
    placeholder.textContent = "Nessuna miniatura";
    details.append(placeholder);
  }

  const fields = document.createElement("dl");
  fields.className = "preview-record-fields";
  const labels = {
    hash: "Hash",
    fullname: "Percorso completo",
    name: "Nome",
    ext: "Estensione",
    size: "Dimensione",
    createdAt: "Data creazione file",
    exifCreateDate: "EXIF CreateDate",
    exifDateTimeOriginal: "EXIF DateTimeOriginal",
    exifGPSDateStamp: "EXIF GPSDateStamp",
    exifModifyDate: "EXIF ModifyDate"
  };
  for (const [key, label] of Object.entries(labels)) {
    const term = document.createElement("dt");
    term.textContent = label;
    const value = document.createElement("dd");
    const fieldValue = record[key];
    value.textContent = fieldValue === null || fieldValue === undefined || fieldValue === ""
      ? "—"
      : key === "size" && Number.isFinite(fieldValue)
        ? `${fieldValue.toLocaleString()} byte`
        : String(fieldValue);
    fields.append(term, value);
  }
  details.append(fields);

  const editFields = document.createElement("div");
  editFields.className = "preview-record-edit-fields";
  const dateLabel = document.createElement("label");
  dateLabel.className = "preview-edit-field";
  const dateCaption = document.createElement("span");
  dateCaption.textContent = "Data valida";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.dataset.previewDate = "";
  dateInput.value = dateInputValue(record.dt_valida);
  dateLabel.append(dateCaption, dateInput);
  const albumsDiv=document.createElement("div");
  const albumsLabel = document.createElement("label");
  albumsLabel.className = "preview-edit-field";
  const albumsCaption = document.createElement("div");
  albumsCaption.textContent = "Albums (un nome per riga)";
  console.log(record.albums);
  albumsDiv.innerHTML="Albums</br>"
  record.albums.forEach(album=>{
    albumsDiv.innerHTML+=`<input type='checkbox' id="${album}" class="albumClass" name="${album}" checked>${album}</input></br>`;
  });
    albumsDiv.innerHTML+=`<input type='TEXT' id="new-album"></input></br>`;

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.dataset.savePreviewRecord = "";
  saveButton.textContent = "Salva modifiche";
  const editStatus = document.createElement("span");
  editStatus.className = "status";
  editStatus.dataset.previewEditStatus = "";
  editStatus.setAttribute("role", "status");
  editFields.append(dateLabel, albumsDiv, saveButton, editStatus);
  details.append(editFields);
  return details;
}

function selectPreviewRecord(index) {
  const record = previewRecords[index];
  if (!record) return;
  selectedPreviewRecordId = record.recordId;
  for (const [recordIndex, button] of [...previewContent.querySelectorAll(".preview-record")].entries()) {
    button.setAttribute("aria-pressed", String(recordIndex === index));
  }
  previewContent.querySelector(".preview-record-inspector")?.replaceWith(renderPreviewDetails(record));
}

async function savePreviewRecord(button) {
  const inspector = button.closest(".preview-record-inspector");
  const recordId = selectedPreviewRecordId;
  const record = previewRecords.find(item => item.recordId === recordId);
  if (!inspector || !record) return;

  const status = inspector.querySelector("[data-preview-edit-status]");
  const dateInput = inspector.querySelector("[data-preview-date]");
  const albumsList = document.getElementsByClassName("albumClass");
  const dtValida = dateInput.value;
  var albums=[];
  for(const album of albumsList){
    if(album.checked) albums.push(album.name);
  }
  const newAlbum=document.getElementById("new-album");
  if(newAlbum && newAlbum.value !== null && newAlbum.value !== "") 
    albums.push(newAlbum.value.trim());
  console.log(albums.join(","));
  button.disabled = true;
  status.textContent = "Salvataggio…";
  try {
    const data = await requestJson("/api/preview/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        archivePath: profileForm.elements.archive.value.trim(),
        recordId,
        dtValida,
        albums
      })
    });
    const index = previewRecords.findIndex(item => item.recordId === recordId);
    if (index >= 0) previewRecords[index] = data.record;
    await refreshPreview();
    previewStatus.textContent = "Modifiche salvate";
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

async function refreshPreview(resetOffset = false,dati=true) {
  if (previewLoading) return;
  if (resetOffset) previewOffset = 0;
  const archivePath = profileForm.elements.archive.value.trim();
  if (!archivePath) {
    previewStatus.textContent = "Seleziona il database archivio nel profilo";
    previewRecords = [];
    previewContent.replaceChildren();
    previewPreviousButton.disabled = true;
    previewNextButton.disabled = true;
    return;
  }

  previewLoading = true;
  previewStatus.textContent = "Lettura archivio…";
  document.querySelector("#preview-filter-button").disabled = true;
  try {
    const data = await requestJson("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        archivePath,
        offset: previewOffset,
        dati:dati,
        filters: {
          search: previewSearch.value.trim(),
          extension: previewExtension.value.trim(),
          dateFrom: previewDateFrom.value,
          dateTo: previewDateTo.value
        }
      })
    });
    previewTotal = data.total;
    previewRecords = data.records;
    const recordList = document.createElement("div");
    recordList.className = "preview-record-list";
    let selectedIndex = previewRecords.findIndex(record => record.recordId === selectedPreviewRecordId);
    if (selectedIndex < 0 && previewRecords.length > 0) selectedIndex = 0;
    selectedPreviewRecordId = selectedIndex >= 0 ? previewRecords[selectedIndex].recordId : null;
    recordList.append(...previewRecords.map((record, index) => {
      const card = renderPreviewRecord(record, index);
      card.setAttribute("aria-pressed", String(index === selectedIndex));
      return card;
    }));
    const selectedRecord = selectedIndex >= 0
      ? renderPreviewDetails(previewRecords[selectedIndex])
      : document.createElement("p");
    if (previewRecords.length === 0) {
      selectedRecord.className = "preview-no-selection";
      selectedRecord.textContent = "Nessun record da visualizzare.";
    }
    previewContent.replaceChildren(recordList, selectedRecord);
    const firstRecord = data.total === 0 ? 0 : data.offset + 1;
    const lastRecord = Math.min(data.offset + data.limit, data.total);
    previewStatus.textContent = data.total === 0
      ? "Nessun record corrisponde ai filtri"
      : `Record ${firstRecord}–${lastRecord} di ${data.total}`;
    previewPreviousButton.disabled = data.offset === 0;
    previewNextButton.disabled = data.offset + data.limit >= data.total;
  } catch (error) {
    previewRecords = [];
    previewContent.replaceChildren();
    previewStatus.textContent = error.message;
    previewPreviousButton.disabled = true;
    previewNextButton.disabled = true;
  } finally {
    previewLoading = false;
    document.querySelector("#preview-filter-button").disabled = false;
  }
}

previewContent.addEventListener("click", event => {
  const saveButton = event.target.closest("[data-save-preview-record]");
  if (saveButton && previewContent.contains(saveButton)) {
    savePreviewRecord(saveButton);
    return;
  }
  const button = event.target.closest(".preview-record");
  if (!button || !previewContent.contains(button)) return;
  selectPreviewRecord(Number(button.dataset.recordIndex));
});

async function refreshProfiles(selectedName = "") {
  const data = await requestJson("/api/profiles");
  profileDefaults = data.defaults;
  const savedNames = data.profiles;
  profileSelector.replaceChildren(new Option("Seleziona un profilo", ""));
  for (const name of savedNames) {
    profileSelector.add(new Option(name, name));
  }
  if (selectedName && savedNames.includes(selectedName)) {
    profileSelector.value = selectedName;
  }
}

async function loadProfile(name) {
  if (!name) {
    profileStatus.textContent = "Seleziona un profilo da caricare";
    return;
  }
  try {
    const data = await requestJson(`/api/profiles/${encodeURIComponent(name)}`);
    applyProfile(data.profile);
    profileStatus.textContent = `Profilo "${name}" caricato`;
    //await refreshPreview(true);
  } catch (error) {
    profileStatus.textContent = error.message;
  }
}

function setStatus(status) {
  const labels = {
    queued: "In coda",
    running: "In elaborazione",
    completed: "Completato",
    failed: "Errore"
  };
  statusLabel.textContent = labels[status] || "Pronto";
  startButton.disabled = status === "queued" || status === "running";
}

function showLogs(entries) {
  if (entries.length === 0 && lastLogCount === 0) return;
  if (lastLogCount === 0) log.replaceChildren();
  for (const entry of entries.slice(lastLogCount)) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    const message = document.createElement("span");
    time.dateTime = entry.at;
    time.textContent = new Date(entry.at).toLocaleTimeString();
    message.textContent = entry.message;
    item.append(time, message);
    log.append(item);
  }
  lastLogCount = entries.length;
  log.scrollTop = log.scrollHeight;
}

async function refreshJob() {
  if (polling) return;
  polling = true;
  try {
    const response = await fetch("/api/jobs/current", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Impossibile leggere lo stato");
    
    if (data.job) {
      setStatus(data.job.status);
      phaseStatus.textContent = data.job.phase || "";
      showLogs(data.job.logs || []);
    } else {
      setStatus("");
      phaseStatus.textContent = "";
      polling=false;
      clearInterval(jobInterval);
    }
  } catch (error) {
    statusLabel.textContent = error.message;
  } finally {
    polling = false;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const phases = [...form.querySelectorAll('input[name="phase"]:checked')].map(input => input.value);
  console.log(phases);
  const payload = {
    profile: readProfileForm(),
    phases
  };
  startButton.disabled = true;
  statusLabel.textContent = "Invio…";
  phaseStatus.textContent = "";
  lastLogCount = 0;
  log.replaceChildren();

  try {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Impossibile avviare l’elaborazione");
    setStatus(data.job.status);
    await refreshJob();
  } catch (error) {
    statusLabel.textContent = error.message;
    startButton.disabled = false;
  }
});

profileForm.addEventListener("submit", async event => {
  event.preventDefault();
  const saveButton = document.querySelector("#save-profile-button");
  saveButton.disabled = true;
  profileStatus.textContent = "Salvataggio…";
  try {
    const data = await requestJson("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: readProfileForm() })
    });
    applyProfile(data.profile);
    await refreshProfiles(data.profile.name);
    profileStatus.textContent = `Profilo "${data.profile.name}" salvato`;
    //await refreshPreview(true);
  } catch (error) {
    profileStatus.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelector("#load-profile-button").addEventListener("click", () => {
  loadProfile(profileSelector.value);
});

document.querySelector("#new-profile-button").addEventListener("click", () => {
  const newName = profileForm.elements.name.value.trim() || "nuovo";
  applyProfile({ ...profileDefaults, name: newName });
  profileStatus.textContent = "Nuovo profilo: configura i valori e salvalo";
  //refreshPreview(true);
});

document.querySelector("#preview-filter-button").addEventListener("click", () => {
  refreshPreview(true);
});

document.querySelector("#preview-reset-button").addEventListener("click", () => {
  previewSearch.value = "";
  previewExtension.value = "";
  previewDateFrom.value = "";
  previewDateTo.value = "";
  refreshPreview(true,false);
});

previewPreviousButton.addEventListener("click", () => {
  previewOffset = Math.max(0, previewOffset - previewPageSize);
  refreshPreview();
});

previewNextButton.addEventListener("click", () => {
  if (previewOffset + previewPageSize < previewTotal) {
    previewOffset += previewPageSize;
    refreshPreview();
  }
});

profileForm.elements.archive.addEventListener("change", () =>{ 
//  refreshPreview(true);
});

for (const button of document.querySelectorAll("[data-directory-target]")) {
  button.addEventListener("click", () => {
    setCartella(button.dataset.directoryTarget);
  });
}

profileSelector.addEventListener("change", () => {
  if (profileSelector.value) loadProfile(profileSelector.value);
});

refreshProfiles().then(async () => {
  if (!profileForm.elements.name.value) {
    const name = "default";
    const savedNames = [...profileSelector.options].map(option => option.value);
    if (savedNames.includes(name)) {
      await loadProfile(name);
      return;
    } else {
      applyProfile(profileDefaults);
    }
  }
  //await refreshPreview(true);
}).catch(error => {
  profileStatus.textContent = error.message;
});

refreshJob();
var jobInterval=setInterval(refreshJob, 5000);

for (const toggle of document.querySelectorAll(".panel-toggle")) {
  toggle.addEventListener("click", () => {
    const content = document.getElementById(toggle.getAttribute("aria-controls"));
    if (!content) return;

    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.textContent = expanded ? "Apri" : "Chiudi";
    toggle.setAttribute("aria-label", `${expanded ? "Apri" : "Chiudi"} pannello`);
    content.hidden = expanded;
  });
}

async function setCartella(id) {
  try {
    const data = await requestJson("/api/sceltaDir", { method: "POST" });
    const input = document.getElementById(id);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Campo cartella non trovato");
    }
    input.value = data.selDir;
    profileStatus.textContent = "Cartella selezionata";
  } catch (error) {
    profileStatus.textContent = error.message;
  }
}