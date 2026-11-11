import path from "node:path";
import sharp from "sharp";
const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".tif", ".tiff", ".nef", ".png", ".webp", ".heic", ".heif", ".avif"
]);
const THUMBNAIL_SIZE = 400;
const THUMBNAIL_VERSION = 2;

export async function createThumbnail(file) {
  
  const extension = path.extname(file.fullname).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return file;
  try {
    const thumbnail = await sharp(file.fullname)
      .rotate()
      .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    file.thumbnail = `data:image/jpeg;base64,${thumbnail.toString("base64")}`;
    file.modified = true;
  } catch (error) {
    console.error(`Error generating thumbnail for ${file.fullname}:`, error);
    file.thumbnail = null;
    file.modified = false;
  }
  return file;
}

