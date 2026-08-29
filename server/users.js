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

// The same forgiveness for the bytes as for the JSON above, and for the same
// reason. Its one caller is the migration at the end of the marks section, which
// reads a file to find out whether it would write it differently; nothing to
// compare against is an answer that leaves the folder alone.
function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

// How one of these files is laid out, in one place, because two of them ask: the
// write below, and the migration, which has to know what the write would produce
// without doing it. Two spaces and a closing newline — these are files meant to
// be opened and read.
function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// Written beside the file and renamed onto it, because a rename is the one file
// operation that cannot half-happen: a process that dies mid-write leaves a
// stray .tmp rather than a truncated marks.json. The trailing newline is for
// whoever opens the export in an editor.
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, jsonText(value));
  fs.renameSync(temporary, file);
}

/* --------------------------------------------------------------------- marks */

// A spot the reader kept, as it goes out to the client and as it sits in the
// file — the same fields the marks table had, because moving a shelf is not a
// reason to change what is on it. `id` is a number for the same reason: the
// endpoints address one mark by id and the client holds ids it was given, and a
// list that renumbered itself would break both.
const MARK_LABEL_MAX = 48;

// The language codes a spot's name can be kept under — lo's own six, the same
// list utils/lang.js holds for the client. A file arriving with anything else
// keeps only these: a label is a fixed handful of names for one spot, not a
// place where a hand-written import can grow the file without bound.
const LABEL_LANGS = ["en", "zh", "ja", "fr", "es", "de"];

function markFile(username) {
  return fileIn(username, "marks.json");
}

// What the spot is called, in each language somebody has given it a name in —
// and only in those. A spot named once carries one key; a spot named twice
// carries two; a spot kept in one tap and never named carries none, and its label
// is `{}`.
//
// A name per language rather than a name, because the reader who typed it was
// reading lo in a language at the time and wrote in that one. A spot called 家 by
// somebody reading in Japanese is a name the English reading of the same list can
// do little with, and lo has six readings of every list. So a name is written
// under the language it was written in — the marks endpoints take that off the
// request — and read back under the language it is being read in, which is what
// utils/label.js is for.
//
// A language with no name in it is left out rather than written in empty. What
// stands in the file is then the names there are and nothing else, which is what
// a file meant to be opened and read should hold — and it is what makes a fourth
// language cost nothing: adding one is a key appearing in the marks that have a
// name in it, not a fourth blank line in every mark that does not.
//
// Two older shapes are read as well as this one, since a file written before it —
// by lo itself, or by somebody's AI off the conversion prompt — is still
// somebody's list. A plain string is a name in a language nothing wrote down, and
// it goes under English, which is where every reader's fallback runs next.
// `places`, the spot's name as another app knew it, fills any language the label
// has nothing of its own for.
function readLabel(value, places) {
  const written = typeof value === "string" ? { en: value } : value;
  const label = {};
  for (const lang of LABEL_LANGS) {
    const name = written?.[lang] || places?.[lang];
    const named = typeof name === "string" ? name.trim().slice(0, MARK_LABEL_MAX) : "";
    if (named) label[lang] = named;
  }
  return label;
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
  // Nothing is not read as a number, because `Number(null)` is 0 and a fix good
  // to 0 metres is a claim about how well the phone knew where it was rather than
  // an admission that it did not say. A mark saved without one is written null and
  // has to still be null the next time the file is read — which, now that a start
  // rewrites these files (see migrateMarks), is the difference between a missing
  // figure and a made-up one spreading through every list lo keeps.
  const accuracy = value.accuracy == null ? NaN : Number(value.accuracy);
  return {
    id,
    time: typeof value.time === "string" ? value.time : new Date(0).toISOString(),
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    // And `place` is not read at all. A file from when lo looked the spot up as
    // it saved it carries the geocoder's line for where the phone was — "下京區 ·
    // 京都市 · 京都府" — which is a name for several thousand doorways and for
    // none of them well. It is dropped on the way past rather than folded into a
    // name somebody chose, and the file loses it the next time one is written.
    label: readLabel(value.label, value.places),
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

// The folder's own marks.json, whole and in the order the file is written in.
// What the export beside the list hands over, and the one reading here that is
// not cut to a length: getMarks above answers a page and stops where the page
// does, and a copy of somebody's spots that quietly ended at the 500th is not a
// copy of anything.
export function getMarkFile(username) {
  const { marks, nextId } = readMarkFile(username);
  return { nextId, marks };
}

export function countMarks(username) {
  return readMarkFile(username).marks.length;
}

// No place name among the arguments, and none looked up: the only name a mark lo
// saves has is the one the reader typed on it, and it is written under the
// language they were reading in when they typed it. A spot kept in one tap and
// not named — which is most of them — goes into the file with an empty label,
// which is a spot no language has a word for yet rather than a spot missing two.
export function createMark(username, { time, latitude, longitude, accuracy, label, lang }) {
  const file = readMarkFile(username);
  const mark = readMark({
    id: file.nextId,
    time,
    latitude,
    longitude,
    accuracy: accuracy ?? null,
    label: label ? { [lang]: label } : null,
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
//
// One language of the name and not the name: what was typed goes under the
// language it was typed in, and the others are left holding whatever they
// were. A reader renaming in Japanese a spot an import named in Chinese has
// added a Japanese name to it, not replaced a name they cannot read; and an empty
// box takes the Japanese name off again without touching the Chinese one.
export function renameMark(username, markId, label, lang) {
  const file = readMarkFile(username);
  const mark = file.marks.find((item) => item.id === markId);
  if (!mark) return null;
  const renamed = { ...mark, label: readLabel({ ...mark.label, [lang]: label ?? "" }) };
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

// The whole list at once. Not a thing the line above can be asked a thousand
// times to do: a reader who has just read in the wrong file wants the list gone,
// and a thousand presses is a different request that happens to end in the same
// place.
//
// `nextId` is kept rather than wound back, for the reason it is kept at all (see
// readMarkFile). A counter that went back to 1 would hand the next mark an id the
// client was told a moment ago was gone — and an emptied list is exactly when
// that client is still holding the old numbers.
//
// The number that was let go is the answer, since the file after this reads the
// same whether it emptied a thousand marks or none.
export function clearMarks(username) {
  const file = readMarkFile(username);
  if (file.marks.length === 0) return 0;
  writeMarkFile(username, { ...file, marks: [] });
  return file.marks.length;
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

// Every account's marks.json brought up to the shape above, once, on the way up
// (see the call in index.js).
//
// Nothing here that readMark does not already do on its own: a file from before
// the label was kept per language is read correctly every time it is read, and
// it is written out in the new shape the next moment anything is kept, renamed or
// deleted in that folder. What this adds is the moment. A folder nobody has
// touched since keeps the old shape indefinitely, and these files are not only
// lo's — they are the thing the reader downloads, hands to another account, opens
// in an editor, reads in a terminal. Leaving half of them in a shape lo no longer
// writes means the reader who opens two of them sees two answers to what a mark
// is, and every later reading of them has to go on allowing for both.
//
// What changes in a file: `place`, the geocoder's line for where the phone was,
// goes; a plain-string label becomes a label in a language; and `places` folds
// into the languages the label has nothing for, its empty strings — the three a
// mark carried to say it had no name — not written down again.
//
// The one thing it cannot know is which language a plain-string label was typed
// in — no version of the file recorded that. English is where it goes, which is a
// guess with a reason behind it (see readLabel) and still a guess: a reader whose
// spots were named in Chinese can rename one in Chinese and clear the English it
// was filed under, and both are a sheet each from the row.
//
// Rewritten only where the writing would differ, so a second start over the same
// folder touches nothing and the files keep the times they were last written at.
export function migrateMarks() {
  if (!fs.existsSync(usersDir)) return 0;
  let rewritten = 0;
  for (const entry of fs.readdirSync(usersDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isSafeName(entry.name)) continue;
    const before = readText(markFile(entry.name));
    const stored = parseJson(before);
    // No file, or one that is not a marks.json at all. A file that cannot be
    // parsed is left exactly as it is rather than written over with an empty
    // list: whatever is in there is somebody's, and a boot is no place to decide
    // it is nothing.
    if (!Array.isArray(stored?.marks)) continue;
    const { marks, nextId } = readMarkFile(entry.name);
    // A row this cannot read is a row the rewrite would drop, so a file holding
    // one is left alone and said out loud instead. The list goes on being read
    // the way it always is — a bad row is passed over — and the tidying happens
    // whenever the reader next keeps a spot, which is their own doing rather than
    // a start-up's.
    if (marks.length !== stored.marks.length) {
      const lost = stored.marks.length - marks.length;
      console.warn(`data/users/${entry.name}/marks.json: ${lost} unreadable rows, left as it is`);
      continue;
    }
    if (jsonText({ nextId, marks }) === before) continue;
    writeMarkFile(entry.name, { marks, nextId });
    rewritten += 1;
    console.log(`tidied ${marks.length} marks in data/users/${entry.name}`);
  }
  return rewritten;
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

const LANGS = new Set(["en", "zh", "ja", "fr", "es", "de"]);
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
