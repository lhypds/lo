import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Where an account's own things sit on disk, and what a stored picture is
// called. Two naming rules, in a module under both of the ones that need them:
// users.js writes the marks and reads a photo's name out of the file it wrote,
// images.js writes the photo and has to know which folder it goes in, and each
// would otherwise be importing the other for half a rule.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const usersDir = path.resolve(__dirname, "..", "data", "users");

// One folder per account: data/users/<username>/, holding marks.json,
// settings.json and the pictures the marks point at.
//
// A username is a folder name here, so it is checked before it is joined to a
// path rather than trusted for having come out of the users table. The pattern
// is the account-name pattern from index.js with the traversal characters that
// were never in it spelled out by their absence: no dot, no slash, no separator
// of any kind, so a name that passes this cannot address anything but its own
// folder under data/users.
const SAFE_NAME_RE =
  /^[a-z0-9_\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}-]{1,32}$/u;

// What the folder is called: the account's name said the one way lo says it, so
// that every route asking about the same account asks about the same folder. The
// users table is unique without regard to case, which means one account can never
// be two folders here — and an account opened by hand before that was true (see
// lo.js) still has somewhere for its things to go rather than a 500 in place of
// its list.
export function folderName(username) {
  return String(username ?? "").trim().normalize("NFKC").toLowerCase();
}

export function isSafeName(username) {
  return SAFE_NAME_RE.test(folderName(username));
}

// The folder an account's own things live in. Throwing rather than returning
// null: every caller is about to read or write inside it, and a path that could
// not be built is a bug in the caller rather than a state to handle.
export function userDir(username) {
  const name = folderName(username);
  if (!SAFE_NAME_RE.test(name)) throw new Error(`Unsafe username: ${username}`);
  return path.join(usersDir, name);
}

// The pictures in it, in their own folder rather than loose beside marks.json:
// what somebody unzips is then a file they can read and a folder of photographs
// next to it, which is the shape of a thing meant to be opened.
export function userImagesDir(username) {
  return path.join(userDir(username), "images");
}

// Every account with a folder, which is every account that has kept a mark or
// changed a setting. Read off the disk rather than out of the users table
// because what the callers are about to do is walk folders, and a folder with no
// row is exactly the case they must not trip over.
export function userNames() {
  try {
    return fs
      .readdirSync(usersDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isSafeName(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------- image names */

// What a stored picture can be, and the type each is served back as. WebP is
// what the browser encodes; the rest are the originals it hands over untouched
// when it cannot encode one.
export const IMAGE_TYPES = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  avif: "image/avif",
};

// Content-addressed: 32 hex characters of the bytes' own digest plus the
// sniffed extension. No separator and no second dot, so a name that passes this
// cannot address anything outside the folder it is joined to.
const STORED_NAME_RE = new RegExp(`^[0-9a-f]{32}\\.(${Object.keys(IMAGE_TYPES).join("|")})$`);

export function isStoredName(name) {
  return STORED_NAME_RE.test(name);
}

export function imageType(name) {
  return IMAGE_TYPES[path.extname(String(name ?? "")).slice(1)] ?? null;
}
