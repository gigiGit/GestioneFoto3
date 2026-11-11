const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const archive = require("./scan-archive.cjs");

test("selectValidDuplicate marks only the selected file as valid", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gestione-foto-duplicates-"));
  const databasePath = path.join(directory, "archive.db");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const db = await archive.openDatabase(databasePath);
  try {
    await archive.initDB(db);
    await archive.upsertFiles(db, [
      { fullname: "a.jpg", name: "a.jpg", hash: "same-hash", ext: ".jpg" },
      { fullname: "b.jpg", name: "b.jpg", hash: "same-hash", ext: ".jpg" },
      { fullname: "c.jpg", name: "c.jpg", hash: "different-hash", ext: ".jpg" }
    ]);
  } finally {
    await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
  }

  await archive.selectValidDuplicate(databasePath, { fullname: "b.jpg", hash: "same-hash" });
  const records = await archive.readArchiveFiles(databasePath);
  const duplicateFlags = records
    .filter(record => record.hash === "same-hash")
    .map(({ fullname, valido }) => [fullname, valido])
    .sort(([left], [right]) => left.localeCompare(right));

  assert.deepEqual(duplicateFlags, [["a.jpg", 0], ["b.jpg", 1]]);
  await assert.rejects(
    archive.selectValidDuplicate(databasePath, { fullname: "c.jpg", hash: "different-hash" }),
    /non appartiene a un gruppo di duplicati/
  );
});

test("scan persists after walking files and can defer persistence", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gestione-foto-scan-"));
  const sourceDir = path.join(directory, "source");
  const scanDir = path.join(directory, "scan");
  const databasePath = path.join(directory, "archive.db");
  await fs.mkdir(sourceDir);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const { scan } = await import("./scanner.js");
  await fs.writeFile(path.join(sourceDir, "first.jpg"), "first image bytes");
  const firstScan = await scan({ sourceDir, scanDir, archive: databasePath });
  assert.equal(firstScan.length, 1);
  assert.equal((await archive.readArchiveFiles(databasePath)).length, 1);

  await fs.writeFile(path.join(sourceDir, "second.jpg"), "second image bytes");
  const deferredScan = await scan({ sourceDir, scanDir, archive: databasePath, persist: false });
  assert.equal(deferredScan.length, 2);
  assert.equal((await archive.readArchiveFiles(databasePath)).length, 1);
});

test("updateArchiveRecord saves datetime and keeps one valid duplicate", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gestione-foto-record-"));
  const databasePath = path.join(directory, "archive.db");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const db = await archive.openDatabase(databasePath);
  try {
    await archive.initDB(db);
    await archive.upsertFiles(db, [
      { fullname: "a.jpg", name: "a.jpg", hash: "same-hash", ext: ".jpg" },
      { fullname: "b.jpg", name: "b.jpg", hash: "same-hash", ext: ".jpg" }
    ]);
  } finally {
    await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
  }

  await archive.updateArchiveRecord(databasePath, {
    fullname: "b.jpg",
    dtValida: "2026-11-10T12:34:00.000Z",
    valido: true
  });
  const records = await archive.readArchiveFiles(databasePath);
  assert.deepEqual(
    records.map(({ fullname, dt_valida, valido }) => [fullname, dt_valida, valido]).sort(([left], [right]) => left.localeCompare(right)),
    [["a.jpg", null, 0], ["b.jpg", "2026-11-10T12:34:00.000Z", 1]]
  );
});