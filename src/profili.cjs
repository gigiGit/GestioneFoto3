#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";

function getProfilesDirectory() {
  return process.env.GESTIONEFOTO_PROFILES_DIR
    ? path.resolve(process.env.GESTIONEFOTO_PROFILES_DIR)
    : path.join(process.env.USERPROFILE || require("node:os").homedir(), ".gestione-foto-3", "profiles");
}

function validateProfileName(name) {
  if (typeof name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)) {
    throw new TypeError("Il nome del profilo può contenere lettere, numeri, punti, trattini e underscore (max 64 caratteri)");
  }
  return name;
}

function createDefaultProfile(name = "default") {
  const destDir = path.resolve(".");
  return {
    destDir,
    scanDir: path.join(destDir, "scan"),
    sourceFolders: ".",
    verbose: false,
    batchSize: 10,
    minSize: 4096,
    name: validateProfileName(name),
    extensions: [".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif"],
    archive: path.join(destDir, "archive.db"),
    backupPath: path.join(destDir, "backup"),
    albumPath: path.join(destDir, "album")
  };
}

async function listProfiles() {
  const profilesDir = getProfilesDirectory();
  try {
    const files = await fsp.readdir(profilesDir, { withFileTypes: true });
    return files
      .filter(file => file.isFile() && file.name.endsWith(".json"))
      .map(file => file.name.slice(0, -5))
      .filter(name => {
        try {
          validateProfileName(name);
          return true;
        } catch {
          return false;
        }
      })
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function getProfile(name) {
  validateProfileName(name);
  const profilePath = path.join(getProfilesDirectory(), `${name}.json`);
  try {
    const profile = JSON.parse(await fsp.readFile(profilePath, "utf8"));
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      throw new TypeError(`Invalid profile file: ${profilePath}`);
    }
    return profile;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function loadProfile(options) {
  validateProfileName(options.name);
  const profilePath = path.join(getProfilesDirectory(), `${options.name}.json`);
  if (fs.existsSync(profilePath)) {
    return { ...options, ...JSON.parse(fs.readFileSync(profilePath, "utf-8")) };
  }
  return options;
}

function saveProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new TypeError("Il profilo deve essere un oggetto");
  }
  validateProfileName(profile.name);
  const profilesDir = getProfilesDirectory();
  const profilePath = path.join(profilesDir, `${profile.name}.json`);
  fs.mkdirSync(profilesDir, { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), "utf8");
}

module.exports = {
  createDefaultProfile,
  getProfile,
  listProfiles,
  loadProfile,
  saveProfile
};
