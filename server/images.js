import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.resolve(__dirname, "..", "data", "images");

// The browser compresses to WebP before it uploads, so this is a ceiling on a
// mistake — a RAW file, a video — rather than a size a post is expected to be.
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// What the folder can hold, and the type each is served back as. WebP is what
// the browser encodes; the rest are the originals it hands over untouched when
// it cannot encode one.
const TYPES = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  avif: "image/avif",
};

// Content-addressed: 32 hex characters of the bytes' own digest plus the
// sniffed extension. No separator and no second dot, so a name that passes this
// cannot address anything outside the folder.
const STORED_NAME_RE = new RegExp(`^[0-9a-f]{32}\\.(${Object.keys(TYPES).join("|")})$`);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The format the bytes actually are, or null when they are not an image this
// folder holds. The request's own Content-Type is never trusted for it:
// whatever is written here is served back with a type attached, so the bytes
// have to say what they are themselves.
function sniffExtension(buffer) {
  if (
    buffer.length >= 12 &&
    buffer.toString("latin1", 0, 4) === "RIFF" &&
    buffer.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) return "png";
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("latin1", 0, 6))) return "gif";
  if (
    buffer.length >= 12 &&
    buffer.toString("latin1", 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(buffer.toString("latin1", 8, 12))
  ) {
    return "avif";
  }
  return null;
}

// Naming the file after its own digest buys two things: the same photo posted
// twice is stored once, and the URL can be cached forever — a name never points
// at different bytes than it did before.
export async function storeImage(buffer) {
  const extension = sniffExtension(buffer);
  if (!extension) return null;
  const name = `${crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 32)}.${extension}`;
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.writeFile(path.join(imagesDir, name), buffer);
  return { name, url: `/api/images/${name}`, bytes: buffer.length, type: TYPES[extension] };
}

export function isStoredName(name) {
  return STORED_NAME_RE.test(name);
}

// Where a stored name lives on disk, with the type to serve it as — null for
// anything that is not a name this module wrote.
export function imageFile(name) {
  if (!isStoredName(name)) return null;
  return { path: path.join(imagesDir, name), type: TYPES[path.extname(name).slice(1)] };
}
