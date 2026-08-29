import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// What an account keeps that is nobody else's business, kept as files rather
// than as rows: data/users/<username>/, one folder per account, with marks.json
// and settings.json in it.
//
// The database is for the things accounts say to each other — a post is left on
// the ground for whoever comes past, a message is addressed to somebody, a
// follow is a relation between two names — and all of those are asked about
// across accounts, which is what a table is for. A mark is the opposite kind of
// thing: it is private, it is only ever read back by the one account that wrote
// it, and no query in lo joins it to anything. The same is true of how that
// reader likes their temperature written. Neither has any use for a table, and
// both have a use for being a file: the folder is the whole of what an account
// is holding, which is what makes it something the reader can be handed as a zip
// (see GET /api/users/:username/export.zip) and something a person with a
// terminal can read without a client.
//
// Read and written synchronously, and deliberately. Each of these files is a few
// kilobytes — a list of spots and a handful of preferences — and one request
// touches one of them; the process already blocks on synchronous SQLite for
// every row it serves, so a read here is not the thing that would make it block.
// Sync also keeps the endpoints the shape they were when marks were a table: no
// route grew an await for the sake of the shelf they moved to.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usersDir = path.resolve(__dirname, "..", "data", "users");

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
function folderName(username) {
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

export function hasUserDir(username) {
  return isSafeName(username) && fs.existsSync(userDir(username));
}

function fileIn(username, name) {
  return path.join(userDir(username), name);
}

// Missing, empty, half-written or hand-edited into nonsense all come back the
// same way: the fallback. A file lo cannot read is a file lo has no business
// throwing a 500 about — the reader would see the dashboard fail rather than the
// one list that could not be loaded — and every caller below has a sensible
// answer for "nothing kept yet" already.
function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

// The same forgiveness for text that arrived as for text that was on disk: a
// file somebody picked out of a folder is no likelier to be JSON than one that
// has been hand-edited, and null is an answer the caller has something to say
// about.
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Written beside the file and renamed onto it, because a rename is the one file
// operation that cannot half-happen: a process that dies mid-write leaves a
// stray .tmp rather than a truncated marks.json. The trailing newline is for
// whoever opens the export in an editor.
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

/* --------------------------------------------------------------------- marks */

// A spot the reader kept, as it goes out to the client and as it sits in the
// file — the same fields the marks table had, because moving a shelf is not a
// reason to change what is on it. `id` is a number for the same reason: the
// endpoints address one mark by id and the client holds ids it was given, and a
// list that renumbered itself would break both.
const MARK_LABEL_MAX = 48;

// The language codes a spot's name can be kept under — lo's own three, the same
// list utils/lang.js holds for the client. A file arriving with anything else
// keeps only these: `places` is a fixed handful of names for one spot, not a
// place where a hand-written import can grow the file without bound.
const PLACE_LANGS = ["en", "zh", "ja"];

function markFile(username) {
  return fileIn(username, "marks.json");
}

// What the spot is called in each language it is known in, or null where it is
// known in none.
//
// Null is an ordinary answer here and not a broken mark: a spot kept before this
// field existed has none, and neither does one converted out of an export that
// only ever had the single name its own app wrote. `place` beside it is what
// those are read by — which is the reason that field stayed the plain string it
// has always been rather than becoming this one.
function readPlaces(value) {
  if (!value || typeof value !== "object") return null;
  const places = {};
  for (const lang of PLACE_LANGS) {
    const line = typeof value[lang] === "string" ? value[lang].trim() : "";
    if (line) places[lang] = line;
  }
  return Object.keys(places).length > 0 ? places : null;
}

// Newest first, which is the order the list page reads them in and the order the
// table handed them over in. The file is kept that way as well as answered that
// way: the export is meant to be opened and read, and the spot somebody kept
// this afternoon is the one they are looking for.
function sortMarks(marks) {
  return marks.sort((a, b) => String(b.time).localeCompare(String(a.time)) || b.id - a.id);
}

// One stored mark, or null when the row in the file is not one. Same job as a
// column type in the table it replaces: what comes back from here is known to
// have the fields the client is about to be handed, whatever the file said.
function readMark(value) {
  if (!value || typeof value !== "object") return null;
  const id = Number(value.id);
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const accuracy = Number(value.accuracy);
  return {
    id,
    time: typeof value.time === "string" ? value.time : new Date(0).toISOString(),
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    label: typeof value.label === "string" ? value.label.slice(0, MARK_LABEL_MAX) : null,
    place: typeof value.place === "string" ? value.place : null,
    places: readPlaces(value.places),
  };
}

// The whole file, as the pair the rest of this section works on: the list, and
// the number the next mark will be. `nextId` is kept rather than derived so that
// deleting the last mark and keeping another does not hand the client back an id
// it has just been told is gone; a file without one — hand-written, or from
// before this line — gets the derived answer instead of nothing.
function readMarkFile(username) {
  const stored = readJson(markFile(username), {});
  const marks = sortMarks((Array.isArray(stored.marks) ? stored.marks : []).map(readMark).filter(Boolean));
  const nextId = Number(stored.nextId);
  const highest = marks.reduce((top, mark) => Math.max(top, mark.id), 0);
  return {
    marks,
    nextId: Number.isSafeInteger(nextId) && nextId > highest ? nextId : highest + 1,
  };
}

function writeMarkFile(username, { marks, nextId }) {
  writeJson(markFile(username), { nextId, marks: sortMarks(marks) });
}

export function getMarks(username, limit = 200) {
  return readMarkFile(username).marks.slice(0, limit);
}

export function countMarks(username) {
  return readMarkFile(username).marks.length;
}

export function createMark(username, { time, latitude, longitude, accuracy, label, place, places }) {
  const file = readMarkFile(username);
  const mark = readMark({
    id: file.nextId,
    time,
    latitude,
    longitude,
    accuracy: accuracy ?? null,
    label: label ?? null,
    place: place ?? null,
    places: places ?? null,
  });
  // The endpoint checks the coordinates before it gets here, so nothing should
  // ever be turned down at this line. Thrown rather than written: a mark that
  // could not be read is one that would go into the file as a null and be
  // dropped by the next reading of it, which is a spot quietly lost.
  if (!mark) throw new Error("Not a mark");
  writeMarkFile(username, { marks: [mark, ...file.marks], nextId: file.nextId + 1 });
  return mark;
}

// Null when there is no such mark, which is how the endpoint tells a stale id
// from a saved one — the same answer the UPDATE ... changes === 0 gave.
export function renameMark(username, markId, label) {
  const file = readMarkFile(username);
  const mark = file.marks.find((item) => item.id === markId);
  if (!mark) return null;
  const renamed = { ...mark, label: label ?? null };
  writeMarkFile(username, {
    ...file,
    marks: file.marks.map((item) => (item.id === markId ? renamed : item)),
  });
  return renamed;
}

export function deleteMark(username, markId) {
  const file = readMarkFile(username);
  const kept = file.marks.filter((item) => item.id !== markId);
  if (kept.length === file.marks.length) return false;
  writeMarkFile(username, { ...file, marks: kept });
  return true;
}

// What makes two rows the same spot: where it was and the moment it was kept,
// which is the whole of what a mark is. Not the id, which is a counter per file
// — the same afternoon is a different number in two folders, and two different
// afternoons share a number across them. Not the name either: a spot renamed on
// one device and not the other is exactly the case where a file and a folder
// disagree about something they both hold, and the two are still one spot.
function markKey(mark) {
  return `${mark.time}|${mark.latitude}|${mark.longitude}`;
}

// A marks.json read back in: the file the export handed out, put into the folder
// it came from — after a mistake, or onto a second account, or into the same one
// on a machine that has been keeping its own list since.
//
// A merge and not a replacement, because both sides are somebody's spots and
// neither is the draft of the other: what is in the folder stays, and what the
// file has that the folder does not is added to it. Which is also what makes the
// same file safe to read in twice — the second time matches every row and adds
// nothing.
//
// Ids are reissued from this folder's own counter rather than carried in. A mark
// arriving as 7 beside one that is already 7 would be two rows the endpoints
// address as one, and the id of a spot is the folder's business anyway.
//
// Null when what arrived was not a marks.json at all, which is the one outcome
// the reader has something to do about; everything else is a number of marks.
export function mergeMarks(username, incoming) {
  const stored = typeof incoming === "string" ? parseJson(incoming) : incoming;
  // The whole file as it is written, and a bare list too: what lo hands out is
  // the object, and the array inside it is what somebody assembling a file by
  // hand is likely to write.
  const rows = Array.isArray(stored) ? stored : Array.isArray(stored?.marks) ? stored.marks : null;
  if (!rows) return null;

  const file = readMarkFile(username);
  const seen = new Set(file.marks.map(markKey));
  const added = [];
  let nextId = file.nextId;
  for (const row of rows) {
    const mark = readMark({ ...row, id: nextId });
    // A row that is not a mark is passed over rather than refused for the file
    // it came in: one unreadable line is no reason to turn away the spots around
    // it, and the reader is told how many of them arrived.
    if (!mark || seen.has(markKey(mark))) continue;
    seen.add(markKey(mark));
    added.push(mark);
    nextId += 1;
  }

  // Nothing written where nothing was added, so reading a file back in twice
  // leaves the folder's own file untouched the second time.
  if (added.length > 0) writeMarkFile(username, { marks: [...added, ...file.marks], nextId });
  return {
    added: added.length,
    skipped: rows.length - added.length,
    count: file.marks.length + added.length,
  };
}

// The one-way door out of the marks table (see db.js). Rows that were kept in
// SQLite are written into the file they should have been in, and only where
// there is no file yet: a second run over a folder that already has one would
// put an old copy over a list the reader has since added to.
export function importMarks(username, rows) {
  if (!isSafeName(username) || fs.existsSync(markFile(username))) return false;
  const marks = sortMarks(rows.map(readMark).filter(Boolean));
  if (marks.length === 0) return false;
  writeMarkFile(username, { marks, nextId: marks.reduce((top, mark) => Math.max(top, mark.id), 0) + 1 });
  return true;
}

/* ------------------------------------------------------------------ settings */

// What the reader has decided about how lo is shown to them, kept for the
// account rather than for the browser it was decided in. The dashboard's own
// stores still write to localStorage — that is what makes the page the shape it
// was left in before the session has even come back — and this is the copy that
// crosses to the next device: signing in reads it and the stores adopt it (see
// utils/settings.js).
//
// What the defaults say is what lo did before it could be asked, which is the
// only honest answer for a reader it has not met: a 24-hour clock and Celsius
// because the language a page is read in is not where its reader is standing,
// the quiet map because that is the face the tile opens on, and no language
// because the browser's own is the better guess until somebody picks one.
const DEFAULT_SETTINGS = {
  units: { hour12: false, fahrenheit: false },
  lang: null,
  mapStyle: "simple",
  layout: {},
};

const LANGS = new Set(["en", "zh", "ja"]);
const MAP_STYLES = new Set(["simple", "detailed", "satellite"]);
// The rungs a panel can stand on, in squares (see utils/cards.js). Held here as
// a range rather than as the list, since what this file is for is refusing a
// number that could never have come from the page.
const CARD_SIZE_MAX = 6;
// Enough room for every card in the catalog and then some, so a client that has
// gone wrong cannot grow the file without bound.
const LAYOUT_MAX = 64;
const CARD_ID_RE = /^[a-z][a-z0-9-]{0,31}$/;

function settingsFile(username) {
  return fileIn(username, "settings.json");
}

function readBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function readCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

// One card's row of the layout: which of the reader's answers about that tile
// have actually been given. Only the fields that were given are kept, because
// "I put that away" and "that did not exist yet" are different answers and a row
// full of defaults cannot tell them apart — the same argument utils/cards.js
// makes about what it stores.
function readCardChoice(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const choice = {};
  if (typeof value.on === "boolean") choice.on = value.on;
  if (typeof value.turned === "boolean") choice.turned = value.turned;
  const size = Number(value.size);
  if (Number.isSafeInteger(size) && size >= 1 && size <= CARD_SIZE_MAX) choice.size = size;
  const added = readCount(value.added);
  if (added !== undefined && added > 0) choice.added = added;
  const rank = readCount(value.rank);
  if (rank !== undefined) choice.rank = rank;
  return Object.keys(choice).length > 0 ? choice : null;
}

// Which cards there are is not checked, only that a key could be one. The
// catalog lives in the browser, where the tiles and their headings are, and a
// second copy here is a copy that would drift: a card added to the dashboard and
// refused by the server would be one whose size the reader could set and never
// keep. What the shape is for is the file — a slug, so nothing else can be
// smuggled into it.
function readLayout(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const layout = {};
  for (const [id, choice] of Object.entries(value)) {
    if (Object.keys(layout).length >= LAYOUT_MAX) break;
    if (!CARD_ID_RE.test(id)) continue;
    const kept = readCardChoice(choice);
    if (kept) layout[id] = kept;
  }
  return layout;
}

// Whatever is in the file, said in the shape the current version of lo asks in:
// fields it has never heard of are dropped, fields it expects and cannot find
// come back as the default. Nothing is written by reading — a settings.json is
// created by the first save, and a reader who has never changed anything is one
// whose folder says so.
function readSettings(stored) {
  return {
    units: {
      hour12: readBoolean(stored?.units?.hour12, DEFAULT_SETTINGS.units.hour12),
      fahrenheit: readBoolean(stored?.units?.fahrenheit, DEFAULT_SETTINGS.units.fahrenheit),
    },
    lang: LANGS.has(stored?.lang) ? stored.lang : DEFAULT_SETTINGS.lang,
    mapStyle: MAP_STYLES.has(stored?.mapStyle) ? stored.mapStyle : DEFAULT_SETTINGS.mapStyle,
    layout: readLayout(stored?.layout),
  };
}

// The account's own answers, or null where it has never given any. Null rather
// than the defaults on purpose, and it is the difference the client acts on: a
// reader signing in for the first time on a browser they have already been using
// has decided things about lo that this account has no answer to, and "no file
// yet" is what tells the browser to offer its own answers up rather than take a
// set of defaults over them (see utils/settings.js).
export function getSettings(username) {
  if (!hasSettings(username)) return null;
  return readSettings(readJson(settingsFile(username), null));
}

export function hasSettings(username) {
  return isSafeName(username) && fs.existsSync(settingsFile(username));
}

// A patch rather than the whole object, and merged one question at a time: a
// device saving the map style has not been asked about the layout, and a save
// that carried the defaults for everything it was not about would undo whatever
// another device had just decided.
//
// The layout is the exception that proves it. It merges per card, not per field
// of a card, because a card is the unit the reader decides about — turning the
// news on says nothing about how tall the posts panel stands, and saying it
// should would be the same mistake one rung down.
export function saveSettings(username, patch) {
  const current = readSettings(readJson(settingsFile(username), null));
  const wanted = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  const merged = readSettings({
    units: { ...current.units, ...(wanted.units ?? null) },
    lang: "lang" in wanted ? wanted.lang : current.lang,
    mapStyle: wanted.mapStyle ?? current.mapStyle,
    layout: { ...current.layout, ...readLayout(wanted.layout) },
  });
  writeJson(settingsFile(username), merged);
  return merged;
}

/* ------------------------------------------------------------------- leaving */

// Everything the account was holding, gone with the account: the row cascades
// through the database and the folder goes here, so closing an account leaves
// nothing of it on either shelf (see deleteUser in db.js).
export function forgetUser(username) {
  if (!isSafeName(username)) return;
  fs.rmSync(userDir(username), { recursive: true, force: true });
}
