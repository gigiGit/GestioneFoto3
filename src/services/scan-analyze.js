import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readArchiveFiles, writeArchiveFiles } from "./scan-archive.cjs";

import exifr from "exifr";


export function toLocalISOString(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (num) => String(Math.floor(Math.abs(num))).padStart(2, '0');

  const localDate = new Date(date.getTime() + offset * 60 * 1000);
  try {
    return localDate.toISOString().slice(0, -1) + `Z`; //${sign}${pad(offset / 60)}:${pad(offset % 60)}
  } catch {
    return null;
  }
}

function creaData(year, month, day, hour = 0, minute = 0, second = 0) {
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day) {
    return null;
  }
  return date;
}
const verbose = false;
const print = verbose ? console.log : () => { };

function recuperaDataDaFullName(file) {
  const filename = typeof file.name === "string"
    ? file.name
    : typeof file.fullname === "string" ? path.basename(file.fullname) : "";

  const datePatterns = [
    /(?<!\d)(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?:[T _-](\d{2})[:._-]?(\d{2})(?:[:._-]?(\d{2}))?)?(?!\d)/g,
    /(?<!\d)(\d{4})(\d{2})(\d{2})(?:[T _-](\d{2})[:._-]?(\d{2})(?:[:._-]?(\d{2}))?)?(?!\d)/g,
    /(?<!\d)(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})(?:[T _-](\d{2})[:._-]?(\d{2})(?:[:._-]?(\d{2}))?)?(?!\d)/g,
    /(?<!\d)(\d{2})(\d{2})(\d{4})(?:[T _-](\d{2})[:._-]?(\d{2})(?:[:._-]?(\d{2}))?)?(?!\d)/g
  ];

  for (const [patternIndex, pattern] of datePatterns.entries()) {
    for (const match of filename.matchAll(pattern)) {
      const [, first, second, third, hour, minute, secondOfMinute] = match;
      const dayFirst = patternIndex >= 2;
      const year = Number(dayFirst ? third : first);
      const month = Number(second);
      const day = Number(dayFirst ? first : third);
      const date = creaData(year, month, day, Number(hour || 0), Number(minute || 0), Number(secondOfMinute || 0));
      if (date) return date;
    }
  }

  if (typeof file.fullname !== "string") return null;
  const folders = path.dirname(file.fullname).split(/[\\/]+/);
  for (let index = folders.length - 1; index >= 0; index--) {
    const year = Number(folders[index]);
    const month = Number(folders[index + 1]);
    if (!/^\d{4}$/.test(folders[index]) || !/^\d{1,2}$/.test(folders[index + 1] || "")) {
      continue;
    }

    const dayFolder = folders[index + 2];
    if (/^\d{1,2}$/.test(dayFolder || "")) {
      const date = creaData(year, month, Number(dayFolder));
      if (date) return date;
      continue;
    }
    const date = creaData(year, month, 1);
    if (date) return date;
  }
  return null;
}

export async function old_analisiThumbnail(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}







