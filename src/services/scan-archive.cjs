const path = require("node:path");
const fs = require("node:fs/promises");

const sqlite3 = require("sqlite3");
const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif"
]);
const INSERT_SQL = `INSERT INTO raw_files (
  hash, fullname, name, ext, dt_valida, size, createdAt,
  exifCreateDate, exifDateTimeOriginal, exifGPSDateStamp, exifModifyDate, thumbnail, albums,valido,destPath
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function run(db, sql, values = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, values, function (error) {
      if (error) reject(error);
      else resolve(this.changes);
    });
  });
}

async function upsertFiles(db, files) {
  const columns = [
    "hash", "fullname", "name", "ext", "dt_valida", "size", "createdAt",
    "exifCreateDate", "exifDateTimeOriginal", "exifGPSDateStamp", "exifModifyDate",
    "thumbnail", "albums", "valido", "destPath"
  ];
  const assignments = columns.map(column => `${column} = COALESCE(?, ${column})`).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  await run(db, "BEGIN IMMEDIATE");
  try {
    for (const file of files) {
      const values = columns.map(column => column === "albums" && Array.isArray(file.albums)
        ? JSON.stringify(file.albums)
        : file[column] ?? null);
      const changes = await run(db, `UPDATE raw_files SET ${assignments} WHERE fullname = ?`, [...values, file.fullname]);
      if (changes === 0) {
        await run(db, `INSERT INTO raw_files (${columns.join(", ")}) VALUES (${placeholders})`, values);
      }
    }
    await run(db, "COMMIT");
  } catch (error) {
    await run(db, "ROLLBACK");
    throw error;
  }
}

async function writeArchiveFiles(databasePath, files) {
  const db = await openDatabase(databasePath);
  try {
    await initDB(db);
    await upsertFiles(db, files);
  } finally {
    await closeDatabase(db);
  }
}

function openDatabase(databasePath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(databasePath, error => {
      if (error) {
        reject(new Error(`Unable to open archive database ${databasePath}: ${error.message}`, { cause: error }));
        return;
      }
      resolve(db);
    });
  });
}

function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.close(error => error ? reject(error) : resolve());
  });
}

function openReadOnlyDatabase(databasePath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY, error => {
      if (error) {
        reject(new Error(`Unable to open archive database ${databasePath}: ${error.message}`, { cause: error }));
        return;
      }
      resolve(db);
    });
  });
}

function openExistingDatabase(databasePath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READWRITE, error => {
      if (error) {
        reject(new Error(`Unable to open archive database ${databasePath}: ${error.message}`, { cause: error }));
        return;
      }
      resolve(db);
    });
  });
}

function get(db, sql, values = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, values, (error, row) => error ? reject(error) : resolve(row));
  });
}

function all(db, sql, values = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, values, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function deserializeAlbums(value) {
  if (value === null || value === undefined || value === "") return [];
  let albums =[];
  try{
    albums = JSON.parse(value);
  } catch (error) {

  }
  if (!Array.isArray(albums) || albums.some(album => typeof album !== "string")) {
    throw new TypeError("Invalid albums value in archive record");
  }
  return albums;
}

function mapArchivedRecord(record) {
  return { ...record, albums: deserializeAlbums(record.albums) };
}

async function readArchiveFiles(archivePath, filters = {}, sellist = "*") {
  const db = await openReadOnlyDatabase(path.resolve(archivePath));
  try {
    const conditions = [];
    const values = [];
    const text = value => typeof value === "string" ? value.trim() : "";
    if (text(filters.name)) {
      conditions.push("instr(lower(COALESCE(name, '')), lower(?)) > 0");
      values.push(text(filters.name));
    }
    if (text(filters.ext)) {
      const extension = text(filters.ext);
      conditions.push("lower(ext) = lower(?)");
      values.push(extension.startsWith(".") ? extension : `.${extension}`);
    }
    if (text(filters.album)) {
      conditions.push("EXISTS (SELECT 1 FROM json_each(COALESCE(NULLIF(albums, ''), '[]')) WHERE lower(value) = lower(?))");
      values.push(text(filters.album));
    }
    if (text(filters.dateFrom)) {
      conditions.push("date(dt_valida) >= date(?)");
      values.push(text(filters.dateFrom));
    }
    if (text(filters.dateTo)) {
      conditions.push("date(dt_valida) <= date(?)");
      values.push(text(filters.dateTo));
    }
    if (filters.rowcount) {
      conditions.push("rowid <= ?");
      values.push(Number(filters.rowcount));
    }
    if (filters.minSize !== undefined && filters.minSize !== null && filters.minSize !== "" &&
      Number.isInteger(Number(filters.minSize)) && Number(filters.minSize) >= 0) {
      conditions.push("size >= ?");
      values.push(Number(filters.minSize));
    }
    if ([0, 1, "0", "1"].includes(filters.valido)) {
      conditions.push("valido = ?");
      values.push(Number(filters.valido));
    }
    const orderBy = new Map([
      ["dt_valida", "dt_valida DESC, name COLLATE NOCASE"],
      ["name", "name COLLATE NOCASE"],
      ["size", "size DESC, name COLLATE NOCASE"]
    ]).get(filters.orderBy);
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const order = orderBy ? ` ORDER BY ${orderBy}` : "";
    const records = await all(db, `SELECT ${sellist} FROM raw_files ${where} ${order}`, values);
    return records.map(mapArchivedRecord);
  } finally {
    await closeDatabase(db);
  }
}
async function readSomeRecords(archivePath, filters =null) {
  console.log("Lettura record dall'archivio", archivePath);
  const db = await openReadOnlyDatabase(path.resolve(archivePath));
  var records;
  const WHERE=filters ? "where " + filters : "";
  try {  
    records = await all(db, `SELECT * FROM raw_files ${WHERE}`);
    console.log("Record letti:", records.length);
    return records.map(mapArchivedRecord);
  }catch(error) {
    console.error(error);
  } finally {
    await closeDatabase(db);
  }
}

async function listArchivedFiles(archivePath, { search = "", extension = "", dateFrom = "", dateTo = "", limit = 36, offset = 0 } = {}) {
  const db = await openReadOnlyDatabase(path.resolve(archivePath));
  try {
    const conditions = [];
    const values = [];
    if (search) {
      conditions.push("instr(lower(COALESCE(name, '') || ' ' || COALESCE(fullname, '')), lower(?)) > 0");
      values.push(search);
    }
    if (extension) {
      conditions.push("lower(ext) = lower(?)");
      values.push(extension);
    }
    if (dateFrom) {
      conditions.push("date(dt_valida) >= date(?)");
      values.push(dateFrom);
    }
    if (dateTo) {
      conditions.push("date(dt_valida) <= date(?)");
      values.push(dateTo);
    }
    const columns = await all(db, "PRAGMA table_info(raw_files)");
    if (columns.length === 0) throw new Error("La tabella raw_files non esiste nell’archivio");
    const albumsColumn = columns.some(column => column.name === "albums") ? "albums" : "NULL AS albums";
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const count = await get(db, `SELECT COUNT(*) AS total FROM raw_files ${where}`, values);
    const records = await all(
      db,
      `SELECT rowid AS recordId, hash, fullname, name, ext, dt_valida, size, createdAt,
              exifCreateDate, exifDateTimeOriginal, exifGPSDateStamp, exifModifyDate, thumbnail, ${albumsColumn},valido,destPath
       FROM raw_files ${where}
       ORDER BY dt_valida DESC, name COLLATE NOCASE
       LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    return { records: records.map(mapArchivedRecord), total: count.total };
  } finally {
    await closeDatabase(db);
  }
}

async function updateArchivedFile(archivePath, { recordId, dtValida, albums }) {
  const databasePath = path.resolve(archivePath);
  await fs.access(databasePath);
  const db = await openExistingDatabase(databasePath);
  try {
    await run(db, "BEGIN IMMEDIATE");
    try {
      const columns = await all(db, "PRAGMA table_info(raw_files)");
      if (columns.length === 0) throw new Error("La tabella raw_files non esiste nell’archivio");
      if (!columns.some(column => column.name === "albums")) {
        await run(db, "ALTER TABLE raw_files ADD COLUMN albums TEXT");
      }

      const changes = await run(
        db,
        "UPDATE raw_files SET dt_valida = ?, albums = ? WHERE rowid = ?",
        [dtValida || null, JSON.stringify(albums), recordId]
      );
      if (changes === 0) throw new Error("Il record selezionato non esiste più nell’archivio");

      const record = await get(
        db,
        `SELECT rowid AS recordId, hash, fullname, name, ext, dt_valida, size, createdAt,
                exifCreateDate, exifDateTimeOriginal, exifGPSDateStamp, exifModifyDate, thumbnail, albums,valido,destPath
         FROM raw_files WHERE rowid = ?`,
        [recordId]
      );
      await run(db, "COMMIT");
      return mapArchivedRecord(record);
    } catch (error) {
      await run(db, "ROLLBACK");
      throw error;
    }
  } finally {
    await closeDatabase(db);
  }
}

async function updateArchiveRecord(archivePath, { fullname, dtValida, valido }) {
  const databasePath = path.resolve(archivePath);
  await fs.access(databasePath);
  const db = await openExistingDatabase(databasePath);
  try {
    await run(db, "BEGIN IMMEDIATE");
    try {
      const columns = await all(db, "PRAGMA table_info(raw_files)");
      if (columns.length === 0) throw new Error("La tabella raw_files non esiste nell’archivio");
      if (!columns.some(column => column.name === "albums")) {
        await run(db, "ALTER TABLE raw_files ADD COLUMN albums TEXT");
      }
      if (!columns.some(column => column.name === "valido")) {
        await run(db, "ALTER TABLE raw_files ADD COLUMN valido INTEGER");
      }

      const selected = await get(db, "SELECT fullname, hash FROM raw_files WHERE fullname = ?", [fullname]);
      if (!selected) throw new Error("Il record selezionato non esiste più nell’archivio");

      const dateValue = dtValida || null;
      if (valido && selected.hash) {
        const duplicates = await get(db, "SELECT COUNT(*) AS count FROM raw_files WHERE hash = ?", [selected.hash]);
        if (duplicates.count > 1) {
          await run(
            db,
            `UPDATE raw_files
             SET dt_valida = CASE WHEN fullname = ? THEN ? ELSE dt_valida END,
                 valido = CASE WHEN fullname = ? THEN 1 ELSE 0 END
             WHERE hash = ?`,
            [fullname, dateValue, fullname, selected.hash]
          );
        } else {
          await run(db, "UPDATE raw_files SET dt_valida = ?, valido = 1 WHERE fullname = ?", [dateValue, fullname]);
        }
      } else {
        await run(db, "UPDATE raw_files SET dt_valida = ?, valido = ? WHERE fullname = ?", [dateValue, valido ? 1 : 0, fullname]);
      }

      const record = await get(
        db,
        `SELECT rowid AS recordId, hash, fullname, name, ext, dt_valida, size, createdAt,
                exifCreateDate, exifDateTimeOriginal, exifGPSDateStamp, exifModifyDate, thumbnail, albums, valido,destPath
         FROM raw_files WHERE fullname = ?`,
        [fullname]
      );
      await run(db, "COMMIT");
      return mapArchivedRecord(record);
    } catch (error) {
      await run(db, "ROLLBACK");
      throw error;
    }
  } finally {
    await closeDatabase(db);
  }
}

async function selectValidDuplicate(archivePath, { fullname, hash }) {
  const databasePath = path.resolve(archivePath);
  await fs.access(databasePath);
  const db = await openExistingDatabase(databasePath);
  try {
    await run(db, "BEGIN IMMEDIATE");
    try {
      const duplicateCount = await get(
        db,
        "SELECT COUNT(*) AS count FROM raw_files WHERE hash = ?",
        [hash]
      );
      if (duplicateCount.count < 2) throw new Error("Il file non appartiene a un gruppo di duplicati");

      const selectedRecord = await get(
        db,
        "SELECT fullname FROM raw_files WHERE fullname = ? AND hash = ?",
        [fullname, hash]
      );
      if (!selectedRecord) throw new Error("Il file selezionato non esiste più nell'archivio");

      await run(
        db,
        "UPDATE raw_files SET valido = CASE WHEN fullname = ? THEN 1 ELSE 0 END WHERE hash = ?",
        [fullname, hash]
      );
      await run(db, "COMMIT");
    } catch (error) {
      await run(db, "ROLLBACK");
      throw error;
    }
  } finally {
    await closeDatabase(db);
  }
}

async function initDB(db) {
  const SQL = `CREATE TABLE IF NOT EXISTS raw_files (
    hash TEXT,
    fullname TEXT,
    name TEXT,
    ext TEXT,
    dt_valida TEXT,
    size INTEGER,
    createdAt TEXT,
    exifCreateDate TEXT,
    exifDateTimeOriginal TEXT,
    exifGPSDateStamp TEXT,
    exifModifyDate TEXT,
    thumbnail TEXT,
    albums TEXT,
    valido Integer,
    destPath TEXT,
    primary key (fullname)
  )`;

  try {
    await run(db, SQL);
    const columns = await all(db, "PRAGMA table_info(raw_files)");
    if (!columns.some(column => column.name === "valido")) {
      await run(db, "ALTER TABLE raw_files ADD COLUMN valido INTEGER");
    }
  } catch (error) {
    throw new Error(`Unable to initialize raw_files table: ${error.message}`, { cause: error });
  }
}

async function batchUpdate(db, file) {

  const extension = path.extname(file.fullname).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return false;

  const values = [
    file.hash,
    file.fullname,
    file.name,
    file.ext,
    file.dt_valida,
    file.size,
    file.createdAt,
    file.exifCreateDate,
    file.exifDateTimeOriginal,
    file.exifGPSDateStamp,
    file.exifModifyDate,
    file.thumbnail,
    file.valido,
    file.destPath,
    JSON.stringify(Array.isArray(file.albums) ? file.albums : [])
  ].map(value => value ?? null);

  await new Promise((resolve, reject) => {
    db.run(INSERT_SQL, values, error => {
      if (error) {
        reject(new Error(`Unable to archive ${file.fullname}: ${error.message}`, { cause: error }));
        return;
      }
      resolve();
    });
  });
  return true;
}

async function archiveScanFiles(scanDir, { archivePath = path.join(scanDir, "archive.db"), onLog } = {}) {

  const scanList = scanTools.getScanList(scanDir);
  const databasePath = path.resolve(archivePath);
  await fs.mkdir(path.dirname(databasePath), { recursive: true });

  for (const scanFile of scanList) {
    const scanFilePath = path.join(scanDir, scanFile);
    const item = JSON.parse(await fs.readFile(scanFilePath, "utf-8"));
    if (!Array.isArray(item.files)) {
      throw new TypeError(`Invalid scan file: expected a "files" array in ${scanFilePath}`);
    }

    const db = await openDatabase(databasePath);
    let transactionStarted = false;
    let insertedCount = 0;
    let failure = null;
    try {
      await initDB(db);
      await run(db, "BEGIN IMMEDIATE");
      transactionStarted = true;
      for (const file of item.files) {
        if (await batchUpdate(db, file)) insertedCount++;
      }
      await run(db, "COMMIT");
      transactionStarted = false;
    } catch (error) {
      failure = error;
      if (transactionStarted) {
        try {
          await run(db, "ROLLBACK");
        } catch (rollbackError) {
          failure = new AggregateError(
            [error, rollbackError],
            `Unable to archive scan file ${scanFilePath} and roll back its transaction`
          );
        }
      }
    }

    try {
      await closeDatabase(db);
    } catch (closeError) {
      failure = failure
        ? new AggregateError([failure, closeError], `Unable to close archive database after ${scanFilePath}`)
        : closeError;
    }

    if (failure) throw failure;
    const message = `Archived ${insertedCount} records from ${scanFilePath}.`;
    console.log(message);
    onLog?.(message);
  }
}

module.exports = {
  archiveScanFiles,
  initDB,
  openDatabase,
  readArchiveFiles,
  writeArchiveFiles,
  listArchivedFiles,
  updateArchivedFile,
  updateArchiveRecord,
  selectValidDuplicate,
  upsertFiles, readSomeRecords
};

if (require.main === module) {
  const scanDir = process.argv[2] || "F:\\ArchivioFoto\\scan";
  archiveScanFiles(scanDir).catch(error => {
    console.error("Error processing scan files:", error);
    process.exitCode = 1;
  });
}
