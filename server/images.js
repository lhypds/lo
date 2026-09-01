import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { avatarOwner, avatars, getImage, hasImage, postImageNames, putImage } from "./db.js";
import { IMAGE_TYPES, imageType, isSafeName, isStoredName, userImagesDir, userNames } from "./paths.js";
import { markImageNames } from "./users.js";

// Where a photograph is kept, which is the same question as who it is for.
//
// A mark is private: one account keeps it, one account reads it back, and the
// picture on it is a picture of where that account was standing. So it is a file
// in that account's own folder — data/users/<name>/images/ — beside the
// marks.json that points at it. That is what makes it come out: the export is
// the folder itself (see GET /api/users/:username/export.zip), so a reader who
// asks for their things is handed the photographs as files they can open, rather
// than a list of names for pictures that stayed behind on the server.
//
// A post is the opposite: it is left out on the ground for whoever comes past,
// and its picture is read by every account that comes past it. A thing every
// account reads belongs where the rest of what accounts show each other is, so
// the bytes go into the images table (see db.js) when the post claims them.
//
// An avatar is a third case, filed with the marks in its owner's folder — it is
// their own picture of themselves and belongs in their takeout — with one hole
// cut in that folder's privacy for it: the users table says which name is an
// avatar and whose, and that is the only way a name is served out of a folder to
// somebody who is not its owner (see readImage).
//
// The one shared data/images/ these all used to sit in is neither of those and is
// gone; migrateImages empties it into the two stores above, once, on the way up.

// The browser compresses to WebP before it uploads, so this is a ceiling on a
// mistake — a RAW file, a video — rather than a size a post is expected to be.
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The format the bytes actually are, or null when they are not an image lo
// stores. The request's own Content-Type is never trusted for it: whatever is
// written here is served back with a type attached, so the bytes have to say
// what they are themselves.
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

// Where a picture in somebody's folder is on disk, with the type to serve it as
// — null for anything that is not a name this module wrote, or an account name
// that is not one.
export function userImageFile(username, name) {
  if (!isStoredName(name) || !isSafeName(username)) return null;
  return { path: path.join(userImagesDir(username), name), type: imageType(name) };
}

// Whether a picture is one this account has in its folder — which is to say one
// it uploaded and has not let go of. Asked before a name is written down as
// something only this account may claim to have.
export function ownImage(username, name) {
  const file = userImageFile(username, name);
  return file != null && fs.existsSync(file.path);
}

// Naming the file after its own digest buys two things: the same photo kept
// twice is stored once, and the URL can be cached forever — a name never points
// at different bytes than it did before.
//
// It lands in the uploader's folder whatever it is going to become, because at
// the moment the bytes arrive nothing knows what that is: the sheet uploads the
// photograph when it is chosen and is only afterwards told whether it is going
// on a mark or on a post, and the writer can change their mind about that with
// the picture already up (see ComposeModal). A mark is then already where it
// belongs and costs nothing more; a post claims the bytes into the table on its
// way in; and what is picked and never submitted is left for the sweep.
export async function storeImage(username, buffer) {
  const extension = sniffExtension(buffer);
  if (!extension) return null;
  const name = `${crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 32)}.${extension}`;
  const dir = userImagesDir(username);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, name), buffer);
  return { name, url: `/api/images/${name}`, bytes: buffer.length, type: IMAGE_TYPES[extension] };
}

// A post taking its picture out of its author's folder and into the table every
// account reads. Both files of it — the photograph and the thumbnail each list
// draws in its place — and both optional, since a post may be words alone.
//
// The folder copy is left where it is rather than unlinked here: the same bytes
// may also be on one of the author's own marks, or be their avatar, and the
// sweep is the one place that can see all of that at once. What it costs to wait
// for it is one file.
//
// True when every name asked for is in the table afterwards. False is a picture
// whose bytes are nowhere to be found — a name a client made up, or one already
// swept — and the endpoint turns the post away rather than filing one that
// points at nothing.
export function claimForPost(username, names) {
  for (const name of names) {
    if (!name || hasImage(name)) continue;
    const file = userImageFile(username, name);
    if (!file) return false;
    let bytes;
    try {
      bytes = fs.readFileSync(file.path);
    } catch {
      return false;
    }
    putImage(name, file.type, bytes);
  }
  return true;
}

// The bytes behind a name, for whoever is asking. The order is what decides who
// may see what.
//
// The reader's own folder first — their marks' photographs and their own avatar.
// Private, and the only account that can reach them this way is the one whose
// folder it is. Then the images table, which is public by definition: those are
// the pictures on posts, and a post is left out for whoever comes past. Then,
// last, somebody else's avatar, and only because the users table says that name
// is an avatar and says whose — the one hole in a folder's privacy, cut for the
// one picture in there that exists to be looked at by other people.
//
// A name that is none of these is nothing, whether it is something lo is holding
// but may not serve to this reader or was never a name at all.
export function readImage(reader, name) {
  if (!isStoredName(name)) return null;

  const own = userImageFile(reader, name);
  if (own && fs.existsSync(own.path)) return own;

  const stored = getImage(name);
  if (stored) return { bytes: stored.bytes, type: stored.type };

  const owner = avatarOwner(name);
  const file = owner ? userImageFile(owner, name) : null;
  if (file && fs.existsSync(file.path)) return file;

  return null;
}

// What an account's folder is pointed at by, which is the whole of what keeps a
// file in it: the photographs on its marks, and the one it is wearing as a face.
// Anything a post is using has bytes of its own in the table by now and does not
// need the folder's copy.
function referenced(username) {
  const keep = markImageNames(username);
  const row = avatars().find(({ username: name }) => name.toLowerCase() === String(username).toLowerCase());
  if (row?.avatar) keep.add(row.avatar);
  return keep;
}

// How long a picture nothing points at is left alone. It covers the gap the
// upload opens: the sheet stores the photograph the moment it is chosen and the
// mark or post is written whenever the writer has finished typing, and in
// between the file is in the folder with nothing mentioning it. An hour is
// longer than anybody spends on a caption and short enough that a photo picked
// and abandoned is not in next week's export.
const SWEEP_GRACE_MS = 60 * 60 * 1000;

// What the folder is holding that nothing points at: a photo picked and never
// submitted, one taken off a mark, one a post has claimed into the table.
// Removed, because this folder is the reader's takeout — a picture in it that no
// mark mentions is one they will open and not recognise, and being the truth
// about the account is the whole of what the folder is for.
//
// Run after anything that can orphan one and once on the way up. Anything that
// is not a stored name is left where it is: a file that shape got in here by
// hand, and a folder somebody has put their own things in is not one to tidy on
// their behalf.
export function sweepUserImages(username, now = Date.now()) {
  if (!isSafeName(username)) return 0;
  const dir = userImagesDir(username);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  const keep = referenced(username);
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !isStoredName(entry.name) || keep.has(entry.name)) continue;
    try {
      if (now - fs.statSync(path.join(dir, entry.name)).mtimeMs < SWEEP_GRACE_MS) continue;
      fs.unlinkSync(path.join(dir, entry.name));
      removed += 1;
    } catch {
      // A file that cannot be read or removed is left alone. None of this is
      // worth failing a request over — the sweep comes round again on the next
      // thing the account writes.
    }
  }
  return removed;
}

export function sweepAllUserImages() {
  return userNames().reduce((total, username) => total + sweepUserImages(username), 0);
}

/* ---------------------------------------------------------------- migration */

const legacyDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "data", "images");

// Everything the one shared data/images/ was holding, put where the split at the
// top of this file says it goes: a mark's photograph and an avatar into their
// owner's folder, a post's into the table.
//
// Written to the new place before anything is taken out of the old one, and
// taken out only once the new place has it. Every photograph anybody has ever
// put through lo is in that folder, and a migration that could lose one is not
// worth running. Copied rather than renamed for the same reason twice over: two
// accounts can be pointing at one file — the same photograph kept by both, since
// the name is a digest — and the first of them must not take it out from under
// the second.
//
// A name the new stores could not place is left in the old folder rather than
// deleted, so a second start tries again and a person with a terminal can see
// what was left over. The folder goes when the last file leaves it, and a
// missing folder is the whole of the answer on every start after the first.
export function migrateImages() {
  if (!fs.existsSync(legacyDir)) return 0;
  let placed = 0;

  const intoFolder = (username, name) => {
    if (!isStoredName(name)) return;
    const source = path.join(legacyDir, name);
    const target = userImageFile(username, name);
    if (!target || fs.existsSync(target.path) || !fs.existsSync(source)) return;
    fs.mkdirSync(path.dirname(target.path), { recursive: true });
    fs.copyFileSync(source, target.path);
    placed += 1;
  };

  for (const username of userNames()) {
    for (const name of markImageNames(username)) intoFolder(username, name);
  }
  for (const { username, avatar } of avatars()) intoFolder(username, avatar);

  for (const name of postImageNames()) {
    if (!isStoredName(name) || hasImage(name)) continue;
    const source = path.join(legacyDir, name);
    if (!fs.existsSync(source)) continue;
    putImage(name, imageType(name), fs.readFileSync(source));
    placed += 1;
  }

  // And now the old folder loses what is held somewhere else — only that. A file
  // nothing above claimed is a picture lo has lost track of rather than one it
  // has finished with, and it stays where it is.
  for (const name of fs.readdirSync(legacyDir)) {
    if (!isStoredName(name) || !(hasImage(name) || inSomeFolder(name))) continue;
    try {
      fs.unlinkSync(path.join(legacyDir, name));
    } catch {
      // Left behind, and the next start tries it again.
    }
  }
  try {
    fs.rmdirSync(legacyDir);
  } catch {
    // Still holding something this could not place, which is the state it is
    // meant to be left in.
  }
  return placed;
}

function inSomeFolder(name) {
  return userNames().some((username) => {
    const file = userImageFile(username, name);
    return file != null && fs.existsSync(file.path);
  });
}
