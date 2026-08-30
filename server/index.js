import crypto from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { ZipArchive } from "archiver";
import {
  countPosts,
  countUnread,
  createComment,
  createVenueComment,
  createMessage,
  createPost,
  createUser,
  deleteExpiredSessions,
  deleteConversation,
  deletePost,
  deleteSession,
  followUser,
  getComments,
  getConversation,
  getFollowStats,
  getFollowers,
  getFollowing,
  getLinkKey,
  getOtherPositions,
  getPassword,
  getPost,
  getPostsByUser,
  getPostsNear,
  getProfile,
  getRecentPosts,
  getSession,
  getThreads,
  getUser,
  getUserByLinkKey,
  getVenueCommentCounts,
  getVenueComments,
  readComments,
  readConversation,
  recordLogin,
  savePosition,
  saveSession,
  setDiscoverable,
  setLinkKey,
  setPassword,
  unfollowUser,
  updatePost,
  updateProfile,
} from "./db.js";
import { COMPONENTS, componentsFor, countryList } from "./countries.js";
import {
  isUpstreamDown,
  lookupEvents,
  lookupNearby,
  lookupPlace,
  lookupTrends,
  lookupVenues,
  lookupWarnings,
  lookupWeather,
  lookupWikipedia,
  placeLine,
} from "./geo.js";
import { MAX_IMAGE_BYTES, imageFile, isStoredName, storeImage } from "./images.js";
import { articleId, harvest, readStoredArticle } from "./articles.js";
// The account's own folder: what only that account ever reads back, kept as
// files rather than as rows (see users.js). Named on the way in, because half of
// these words are already taken by something in db.js — `createMark` was a row
// in a table until this shelf existed, and `getSettings` is about to be read
// beside `getSession`.
import {
  clearMarks,
  countMarks as countUserMarks,
  createMark as saveMark,
  deleteMark as removeMark,
  getMarkFile as readMarkFile,
  getMarks as readMarks,
  getSettings as readSettings,
  hasUserDir,
  mergeMarks,
  migrateMarks,
  renameMark as relabelMark,
  saveSettings as writeSettings,
  userDir,
} from "./users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

try {
  // real environment variables take precedence over .env entries
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env file — use the ambient environment as-is
}

// Node races the addresses a hostname resolves to and gives each one 250 ms to
// finish its handshake before moving on to the next — a sensible way to get off
// a broken IPv6 route quickly, and far too little time for a server that is a
// continent away. Overpass answers from Germany at a ~270 ms round trip, so the
// handshake it needs one of to complete was being abandoned a hair before it
// landed, on every address, every time: `fetch failed`, ETIMEDOUT, in under
// three seconds, long before any of the timeouts this app sets for itself.
// Two seconds is still short enough to walk away from an address that is
// genuinely dead.
net.setDefaultAutoSelectFamilyAttemptTimeout(2000);

// The one thing done to the data on the way up rather than on the way past. The
// database's own migrations run as db.js is imported, a line or two above this;
// the accounts' files have none of their own, and a shape they have stopped being
// written in is worth one (see migrateMarks). It is quiet where there is nothing
// to do, which is every start after the first.
migrateMarks();

const port = Number(process.env.PORT) || 3014;
const isProduction = process.env.NODE_ENV === "production";

const USERNAME_RE =
  /^[a-z0-9_\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}-]{1,32}$/u;
const USERNAME_HINT = "A username is 1–32 characters: letters, digits, CJK characters, - and _";
// And one of those characters has to be a letter. Digits, dashes and underscores
// on their own make an account number rather than a name: a purely numeric one
// would be read as an id everywhere it turns up — in a path, in a search box,
// beside a post — and a name in lo is what somebody is called. A letter in any of
// the scripts the pattern above allows counts, so this rules out 12345 without
// ruling out 李明.
const USERNAME_LETTER_RE =
  /[a-z\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}]/u;
const USERNAME_LETTER_HINT = "A username needs at least one letter";
// A password, unlike a username, is nobody's address and nothing links to it, so
// the only rules are the two that stop it being a mistake: long enough to be a
// choice, short enough to have been typed on purpose. Whatever was typed is kept
// as it was typed — no trimming, no case folding — because a space at the end of
// a password is a character of it.
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 64;
const PASSWORD_HINT = `A password is ${PASSWORD_MIN}–${PASSWORD_MAX} characters`;
// A profile lives at /<name>, so lo's own paths are names nobody can have: an
// account called "posts" would be one the router sends to the posts page and
// nothing could ever link to. Kept in step with RESERVED in src/App.jsx.
const RESERVED_NAMES = new Set(["login", "marks", "posts", "account"]);
const sessionAgeMs = 30 * 24 * 60 * 60 * 1000;

// Expired sessions are normally removed when they are presented or when a new
// one is opened. Sweep once at boot as well, so abandoned credentials do not
// accumulate on a quiet server.
deleteExpiredSessions(Date.now());

const LANGS = new Set(["en", "zh", "ja", "fr", "es", "de"]);

function normalizeUsername(value) {
  return String(value ?? "").trim().normalize("NFKC").toLowerCase();
}

// What is wrong with a name, as a body to send back, or nothing where it is a name
// lo will have: the shape, then the letter. Both endpoints that decide whether a
// name may be used at all ask this — the one that signs an existing account in does
// not, since a name already in the table has been answered for and refusing it
// there would lock somebody out of an account rather than turn a new one away.
function usernameFault(username) {
  if (!USERNAME_RE.test(username)) return { error: USERNAME_HINT };
  if (!USERNAME_LETTER_RE.test(username)) {
    return { error: USERNAME_LETTER_HINT, code: "USERNAME_NO_LETTER" };
  }
  return null;
}

// A password as sent, or nothing where what was sent could not be one. Null
// rather than a thrown error because both callers answer the same way, and a
// usable password is never the empty string — so the answer reads as a yes or no.
function usablePassword(value) {
  const password = String(value ?? "");
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return null;
  return password;
}

function requestedLang(req) {
  const lang = String(req.query.lang ?? "en");
  return LANGS.has(lang) ? lang : "en";
}

// Every location-backed endpoint takes the same pair of query parameters, and
// none of them mean anything without both. Returns null when they are unusable.
function parseCoords(query) {
  const latitude = Number(query.lat);
  const longitude = Number(query.lon);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

// Coordinates sent in a body rather than a query — a saved mark, a published
// position — where they are the whole point of the record.
function parseLocation(body) {
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  const accuracy = Number(body?.accuracy);
  return {
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy * 10) / 10 : null,
  };
}

// Where the session is, and there is one place it can be: the Authorization
// header, set deliberately by whichever client is asking. One credential to
// reason about, and no endpoint whose answer turns on which of several happened
// to arrive.
//
// It also reads the same wherever lo runs. The Even Hub package hosts it in a
// cross-site iframe, a position from which anything a browser would attach by
// itself does not survive the trip; a header put on by code that already holds
// the token does. And since nothing ambient authenticates anything, a hostile
// page cannot spend a reader's session — CSRF is out of reach rather than
// fenced off.
function sessionToken(req) {
  return /^Bearer\s+([^\s]+)$/i.exec(String(req.headers.authorization ?? ""))?.[1] ?? null;
}

function sessionHash(token) {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

function currentSession(req) {
  const token = sessionToken(req);
  const tokenHash = token ? sessionHash(token) : null;
  const session = tokenHash ? getSession(tokenHash) : null;
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    deleteSession(tokenHash);
    return null;
  }
  return { tokenHash, ...session };
}

// The address a request came from, as well as it can be known from behind a
// proxy: Express reads it off X-Forwarded-For because of `trust proxy` below,
// which means it is whatever the proxy in front of lo wrote down. Good enough
// for the thing it is for — a person reading the users table and asking whether
// an account is still being used, and from roughly where — and not something to
// hang a decision on: with the chain trusted whole, a client can put an extra
// hop on the front of that header itself.
//
// An IPv4 address arriving over an IPv6 socket comes back mapped, as
// ::ffff:1.2.3.4. That is the same address said the long way, so it is written
// down as the four numbers it is.
function clientIp(req) {
  return String(req.ip ?? "").trim().replace(/^::ffff:/i, "");
}

// Hands the token back, which is the whole of signing somebody in. Every client
// is the same shape — a browser and an Even Hub package both learn the token
// here and both present it in a header — so this is the only place any of them
// can come by the one they will be using from here on.
//
// Which also makes it the one place a sign-in can be written down. All three
// ways in pass through here — a password, a link key, an account just opened —
// and none of them is more of a sign-in than the others. Presenting a token
// already held is not one and does not reach this, so the stamp stays the last
// time somebody signed in rather than the last time they were about.
function startSession(user, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  deleteExpiredSessions(now);
  saveSession(sessionHash(token), user.id, now + sessionAgeMs);
  recordLogin(user.id, clientIp(req));
  return token;
}

// The account's link key: minted the first time it is asked for, and the same one
// from then on. It goes out with every session handed over below, so that signing
// in the ordinary way is the whole of how a key is come by — there is no separate
// errand to run and nothing to have remembered to do first.
//
// Stable on purpose. A key minted afresh on each sign-in would mean every sign-in
// quietly broke every link already handed out, which is the opposite of what the
// thing is for. Withdrawing one is therefore a deliberate act (see DELETE
// /api/me/link), not a side effect of signing in again.
function linkKeyFor(user) {
  const existing = getLinkKey(user.id);
  if (existing) return existing;
  const key = crypto.randomBytes(32).toString("base64url");
  setLinkKey(user.id, key);
  return key;
}

// Forgetting the token is the whole of signing out. The client throws away the
// copy it was holding; this throws away the one that made it mean anything.
function clearSession(req) {
  const session = currentSession(req);
  if (session) deleteSession(session.tokenHash);
}

function requireSession(req, res, next) {
  const session = currentSession(req);
  if (!session) return res.status(401).json({ error: "Please sign in", code: "LOGIN_REQUIRED" });
  const user = getUser(session.username);
  if (!user) {
    clearSession(req);
    return res.status(401).json({ error: "Please sign in again", code: "LOGIN_REQUIRED" });
  }
  req.user = user;
  next();
}

const app = express();
app.set("trust proxy", true);
// The API answers foreign origins, because an Even Hub package is one. The
// wildcard is safe here because nothing is authenticated by anything a browser
// attaches on its own: a bearer token has to be set deliberately by code that
// already holds it. A hostile page can send a request but cannot put a reader's
// session on it. Adding Access-Control-Allow-Credentials would be the way to
// undo that, and there is nothing it would buy.
app.use("/api", (req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  res.set("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
app.use(express.json({ limit: "32kb" }));

app.get("/api/session", (req, res) => {
  const session = currentSession(req);
  const user = session ? getUser(session.username) : null;
  if (!user) return res.status(401).json({ error: "Not signed in", code: "LOGIN_REQUIRED" });
  // The settings ride along here as well as with the three requests that hand out
  // a token: this is the one a browser that is already signed in makes on every
  // load, and what it comes back with is what the page is drawn from. Asking for
  // them separately would mean a first paint in the wrong scale.
  res.json({ user, settings: readSettings(user.username) });
});

// Signing in is asked in two goes — the name, then the password — and this is the
// first of them: it signs nobody in and answers the two things the screen after it
// has to know before it can ask for anything. Whether the name is an account at
// all, since a name nobody has used yet is more often a typo than a new person and
// comes back as USER_NOT_FOUND for the browser to ask about before /api/users opens
// it; and whether that account has a password yet, because one opened before there
// were passwords has its password chosen by the next sign-in that reaches it
// rather than checked.
app.post("/api/username", (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const fault = usernameFault(username);
  if (fault) return res.status(400).json(fault);
  const user = getUser(username);
  if (!user) return res.status(404).json({ error: "No such user", code: "USER_NOT_FOUND" });
  res.json({ username: user.username, hasPassword: getPassword(username) !== null });
});

// And the second, which is the one that signs somebody in — the other request
// that hands a session out is the one below that opens the account in the first
// place, and it is the same screen doing it.
app.post("/api/login", (req, res) => {
  const username = normalizeUsername(req.body?.username);
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: USERNAME_HINT });
  }
  const user = getUser(username);
  if (!user) return res.status(404).json({ error: "No such user", code: "USER_NOT_FOUND" });

  const stored = getPassword(username);
  if (stored === null) {
    // An account from before there were passwords. Nobody can be asked to prove
    // a password that was never set, and lo will not lock its own readers out of
    // accounts they have been using — so the first sign-in to arrive here is the
    // one that chooses it, the same way opening a new account does.
    const password = usablePassword(req.body?.password);
    if (!password) return res.status(400).json({ error: PASSWORD_HINT, code: "PASSWORD_INVALID" });
    setPassword(user.id, password);
  } else if (String(req.body?.password ?? "") !== stored) {
    return res.status(401).json({ error: "Wrong password", code: "PASSWORD_WRONG" });
  }

  // `key` alongside the session: the link this account can be signed in from
  // anywhere else with, which is a password that has already been given rather
  // than a new secret being disclosed to anybody. And the settings, so that the
  // first screen after a sign-in is already in this reader's own scale.
  res.json({ user, token: startSession(user, req), key: linkKeyFor(user), settings: readSettings(user.username) });
});

app.post("/api/logout", (req, res) => {
  clearSession(req);
  res.status(204).end();
});

// The third way in, and the only one that asks for nothing typed: the key out of
// a ?k= or #k= link, traded for the session a password would have opened. What
// comes back is exactly what /api/login hands over, because it is the same
// session by a shorter road — the key stands in for the password rather than for
// something weaker than one.
//
// Answered the way a wrong password is and in as few words: a key that opens
// nothing gets no account named back at it. There is nothing here worth guessing
// at, a key being 32 random bytes rather than a word somebody chose.
app.post("/api/link", (req, res) => {
  const user = getUserByLinkKey(String(req.body?.key ?? ""));
  if (!user) return res.status(401).json({ error: "That link no longer works", code: "LINK_INVALID" });
  res.json({ user, token: startSession(user, req), key: linkKeyFor(user), settings: readSettings(user.username) });
});

// Taking a key back, for a link that got somewhere it should not have. Whichever
// of the two mints below runs next puts a fresh key in place of the one this
// cleared, which is the whole of the recovery. The website never asks for this;
// the Even Hub package asks for it a minute into every launch, because a key left
// standing in a WebView's URL is a password left lying about.
app.delete("/api/me/link", requireSession, (req, res) => {
  setLinkKey(req.user.id, null);
  res.status(204).end();
});

// And minting one, which is the same errand from the other end, for the one
// client that signs two frames in at once. The Even Hub package holds a token of
// its own and hosts lo in a WebView entered on a ?k= link — and it withdraws that
// key a minute later, so there is never a key left over for it to keep. Coming
// back at the next launch on the token it did keep therefore has to be able to
// ask for another key, and this is where it asks: the account the token belongs
// to, and a key to open the frame with. Both halves in one answer, because that
// launch is showing a blank screen until it has them.
//
// Nothing is disclosed here that the token did not already carry. A live session
// and a link key are each the password's equal; what this does is let the first
// be spent on the second, by the one holding it.
app.post("/api/me/link", requireSession, (req, res) => {
  res.json({ user: req.user, key: linkKeyFor(req.user) });
});

// Opening the account and signing into it are still the same request: the name
// and the password it is being given arrive together, from the second screen of
// the same two-step form an existing account is signed into through.
app.post("/api/users", (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const fault = usernameFault(username);
  if (fault) return res.status(400).json(fault);
  const password = usablePassword(req.body?.password);
  if (!password) return res.status(400).json({ error: PASSWORD_HINT, code: "PASSWORD_INVALID" });
  if (RESERVED_NAMES.has(username)) return res.status(409).json({ error: "That username is not available" });
  if (getUser(username)) return res.status(409).json({ error: "That username is taken", code: "USER_EXISTS" });

  try {
    const user = createUser(username, password);
    // The defaults, since there is no folder yet and nothing to read out of one.
    // Sent all the same, so every answer that opens a session has the same shape
    // and the client has one path through it rather than two.
    res.status(201).json({
      user,
      token: startSession(user, req),
      key: linkKeyFor(user),
      settings: readSettings(user.username),
    });
  } catch (error) {
    console.error("create user failed", error);
    res.status(500).json({ error: "Could not create the account" });
  }
});

app.get("/api/me", requireSession, (req, res) => {
  res.json({
    user: req.user,
    markCount: countUserMarks(req.user.username),
    postCount: countPosts(req.user.id),
    settings: readSettings(req.user.username),
  });
});

/* ---------------------------------------------------------------- settings */

// How lo is shown to this reader — the scale the weather is in, the dial the
// clock is on, which language, which face of the map, and the shape of the
// dashboard — kept for the account rather than for the browser it was decided in
// (see users.js and utils/settings.js).
//
// The browser still keeps its own copy and still draws from it first: the page
// has to be the shape it was left in before any request has come back, and a
// reader with no account has nowhere else to keep it. This is the copy that
// crosses to the next device, so it rides along with every answer that opens a
// session — there is no separate errand to run at sign-in, which is what stops
// the first paint being the wrong one.
//
// Null where the account has never saved any, which is not the same as the
// defaults and is why it is not sent as them: a browser that has been used
// signed out is holding answers this account has never been asked, and null is
// what tells it to offer those up instead of taking a blank set over them.
//
// A patch rather than the whole object, always. Two devices are two sets of
// answers to the same questions, and a save that carried the fields it had not
// been asked about would let the one that saved last undo the other (see
// saveSettings).
app.put("/api/me/settings", requireSession, (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Invalid settings" });
  }
  res.json({ settings: writeSettings(req.user.username, req.body) });
});

/* ------------------------------------------------------------------ export */

// Everything lo is holding for one account, as a zip: the folder itself, which
// is the whole point of the folder. marks.json and settings.json are already the
// files a reader would want out of lo, so the export is the directory rather
// than a report assembled for the occasion — what comes down is what is on disk,
// readable in any editor, and re-readable by lo if it is ever put back.
//
// Owner only, and the name in the path has to be the name on the session: a zip
// of somebody's own things is not a thing to hand out on request.
app.get("/api/users/:username/export.zip", requireSession, (req, res) => {
  if (normalizeUsername(req.params.username) !== normalizeUsername(req.user.username)) {
    return res.status(403).json({ error: "That is not your account" });
  }
  // The name on the session rather than the one in the path, now that they are
  // known to be the same account: the folder is named after the row, and the path
  // is whatever the client typed.
  const username = req.user.username;
  // An account that has never kept a mark or changed a setting has no folder to
  // zip. Said as an empty archive rather than as a 404: the reader pressed a
  // button about their own things and nothing is wrong — there is simply nothing
  // in there yet, and a zip that opens on an empty folder says so.
  const dir = hasUserDir(username) ? userDir(username) : null;

  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `lo-${username}-${stamp}.zip`;
  res.setHeader("Content-Type", "application/zip");
  // Twice over, because a username can be CJK: the plain filename is the ASCII
  // fallback for a client that reads only that, and filename* is the one that
  // carries the name itself.
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="lo-export-${stamp}.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", (error) => {
    // Headers are long gone by the time an archive fails, so there is no status
    // left to send: the connection is dropped, which is what tells the browser
    // the download did not finish rather than handing it a truncated zip.
    console.error("export failed", error);
    res.destroy(error);
  });
  archive.pipe(res);
  // The folder either way, even where there is nothing in it: an archive with a
  // named empty folder in it opens, and one with nothing in it at all is a file
  // some tools will not open at all. What the reader gets is the truth about
  // their account said in a form that can be read.
  if (dir) archive.directory(dir, username);
  else archive.append(null, { name: `${username}/` });
  archive.finalize();
});

// Whether this account is one of the dots on everybody else's map.
//
// It gates who may read the position, not whether one is filed: a hidden reader
// is still asking who else is about, and asking is the same round trip as
// telling (see PUT /api/position). So nothing here touches the positions table —
// the switch is read where the list is built, and taking it off makes the reader
// disappear from everybody else's next minute rather than from lo's records.
//
// Their own dot stays where it was, which is the honest drawing: the map is
// where *they* are, and they have not moved.
app.put("/api/me/discoverable", requireSession, (req, res) => {
  const wanted = req.body?.discoverable;
  if (typeof wanted !== "boolean") return res.status(400).json({ error: "Invalid setting" });
  setDiscoverable(req.user.id, wanted);
  res.json({ discoverable: wanted });
});

/* ----------------------------------------------------------------- profile */

// How much of each a profile will hold. The line about yourself is the only one
// with room to be a sentence; a contact is a handle in somebody else's app, and
// none of those are long. A website is a home page rather than a deep link into
// one, so it needs about as much room as an address does. What somebody does is a
// job title and not a description of one — most of them arrive as a slug off the
// sheet's own menu and are a word long.
//
// That menu is checked no more than the list of platforms below it is, and for
// the same reason: the trades and the words for them in each language live in the
// browser (see src/utils/work.js), a second copy here would drift, and the field
// is meant to hold what somebody typed as readily as what they picked. So all
// this side of it asks is that it be short.
const PROFILE_LIMITS = { bio: 280, work: 40, email: 160, website: 200, line: 64, whatsapp: 32, wechat: 64 };

// And the list that has no column of its own: everywhere else somebody keeps an
// account, each row a kind and a handle. Twelve is not a rule about people — it
// is the point past which a profile has stopped being a way to reach somebody.
//
// The kind is checked for shape and not against a list of platforms. The list
// lives in the browser, where the names and the addresses they build are (see
// utils/links.js), and a second copy here is a copy that would drift — a kind
// added to the menu and refused by the server is worse than one the server has
// never heard of, which the page in front of the reader simply shows by name.
// What the shape is for is the column: a slug, so nothing else can be smuggled
// through it.
const LINKS_MAX = 12;
const LINK_VALUE_MAX = 200;
const LINK_KIND_RE = /^[a-z0-9-]{1,24}$/;

// An empty row is dropped rather than refused: the sheet keeps a blank one at the
// end for the next link, and saving with it still blank is not a mistake anybody
// made.
function readLinks(payload) {
  const sent = payload?.links;
  if (sent == null) return { links: [] };
  if (!Array.isArray(sent)) return { error: "Invalid link" };
  const links = [];
  for (const item of sent) {
    const kind = String(item?.kind ?? "").trim().toLowerCase();
    const value = String(item?.value ?? "").trim().normalize("NFKC");
    if (!value) continue;
    if (!LINK_KIND_RE.test(kind)) return { error: "Invalid link" };
    if (value.length > LINK_VALUE_MAX) return { error: `A link is at most ${LINK_VALUE_MAX} characters` };
    links.push({ kind, value });
  }
  if (links.length > LINKS_MAX) return { error: `At most ${LINKS_MAX} links` };
  return { links };
}
// How much of somebody's own writing their page carries. Enough to say what they
// post about without handing out a year of it.
const PROFILE_POSTS = 20;

// One reading of the whole profile, whatever it was sent by — the same reason
// a post has one. An empty field means cleared rather than untouched: the sheet
// holds every field, so what it sends back is the whole of them.
function readProfile(payload) {
  const fields = {};
  for (const [field, limit] of Object.entries(PROFILE_LIMITS)) {
    const value = String(payload?.[field] ?? "").trim().normalize("NFKC");
    if (value.length > limit) return { error: `${field} is at most ${limit} characters` };
    fields[field] = value;
  }
  // The two fields lo can say anything about the shape of. Everything else is a
  // handle in an app lo cannot ask, so a name that looks wrong here is still the
  // only name its owner has.
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    return { error: "Invalid email address" };
  }
  if (fields.website) {
    // Nobody types the scheme, so a bare host is read as one asking for https —
    // which is what a home page typed into a browser's own bar gets too.
    const site = /^[a-z][a-z0-9+.-]*:/i.test(fields.website)
      ? fields.website
      : `https://${fields.website}`;
    // Checked rather than trusted, and this is the one contact lo has to check:
    // it is the only one that becomes an href, and an href will run whatever
    // scheme it is given. Two are addresses on the web and the rest are not
    // somewhere a link can go.
    let url;
    try {
      url = new URL(site);
    } catch {
      return { error: "Invalid web address" };
    }
    // A hostname with a dot in it, so a single word is a typo rather than a
    // machine name nobody outside this network could reach.
    if (!/^https?:$/.test(url.protocol) || !/[^.]\.[^.]/.test(url.hostname)) {
      return { error: "Invalid web address" };
    }
    // The reader's own text with the scheme put back on the front, not the URL
    // object's idea of it: new URL adds a trailing slash to a bare host, and a
    // profile should show the address its owner wrote.
    fields.website = site;
  }

  // The picture arrives as a name /api/images already wrote, never as bytes —
  // the same rule a post's photo is held to, and for the same reason: anything
  // else would let this endpoint name a file of its own choosing.
  const avatar = String(payload?.avatar ?? "").trim();
  if (avatar && !isStoredName(avatar)) return { error: "Invalid avatar" };
  fields.avatar = avatar;

  const { links, error } = readLinks(payload);
  if (error) return { error };
  fields.links = links;

  return { profile: fields };
}

app.patch("/api/me", requireSession, (req, res) => {
  const { profile, error } = readProfile(req.body);
  if (error) return res.status(400).json({ error });
  updateProfile(req.user.id, profile);
  res.json({ user: getUser(req.user.username) });
});

// Somebody else, as far as anyone signed in may ask: who they are, the line they
// wrote about themselves, how to reach them off lo, and what they have left
// lying around. A contact is filled in to be read — that is the whole point of
// filling one in — so it is part of this answer rather than held back.
app.get("/api/users/:username", requireSession, (req, res) => {
  const username = normalizeUsername(req.params.username);
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: USERNAME_HINT });
  const user = getProfile(username);
  if (!user) return res.status(404).json({ error: "No such user", code: "USER_NOT_FOUND" });
  // Who reads them, who they read, and whether the reader asking is one of the
  // first — part of the same answer as the bio and the posts, because it is
  // drawn as one page and a second request for it would let the row of figures
  // arrive after the page it belongs to.
  res.json({
    user,
    follows: getFollowStats(req.user.id, username),
    posts: getPostsByUser(username, PROFILE_POSTS),
  });
});

/* ----------------------------------------------------------------- follows */

// How many names either sheet will draw. Far past what anybody scrolls, and
// there for the same reason every other limit in here is: a list is answered in
// one response, so it has to have an end.
const FOLLOWS_MAX = 200;

// The account an endpoint is about, or nothing. Every endpoint that takes a name
// in its path starts here — the four follow ones below, and the two message ones
// further down — because reading a name out of a path is one act: it has to be
// normalised the same way the login field is, refused in the same words, and
// answered with the same 404 when nobody has it.
function namedUser(req, res) {
  const username = normalizeUsername(req.params.username);
  if (!USERNAME_RE.test(username)) {
    res.status(400).json({ error: USERNAME_HINT });
    return null;
  }
  const user = getUser(username);
  if (!user) {
    res.status(404).json({ error: "No such user", code: "USER_NOT_FOUND" });
    return null;
  }
  return user;
}

// Following and unfollowing are the same request twice with a different verb,
// and both answer with the state they left behind rather than with what they
// did: the button that sent it needs to know which word it is showing now, and
// the two figures beside it have just changed by one.
//
// Pressed twice — a second tab, a press that never came back — is not a mistake
// anybody made, so neither is an error: both endpoints leave the same row there
// or not there whatever they found (see followUser in db.js).
app.put("/api/users/:username/follow", requireSession, (req, res) => {
  const target = namedUser(req, res);
  if (!target) return;
  // Your own page has no button on it, so this is a request nobody's browser
  // sends; the table would refuse the row anyway, and a name in its own list is
  // worth saying no to in words rather than as a constraint failing.
  if (target.id === req.user.id) return res.status(400).json({ error: "You cannot follow yourself" });
  followUser(req.user.id, target.id);
  res.json({ follows: getFollowStats(req.user.id, target.username) });
});

app.delete("/api/users/:username/follow", requireSession, (req, res) => {
  const target = namedUser(req, res);
  if (!target) return;
  unfollowUser(req.user.id, target.id);
  res.json({ follows: getFollowStats(req.user.id, target.username) });
});

// The two lists behind the two figures. Anybody signed in may read either of
// them about anybody: a follow is not a private act — it is already counted on
// a page everyone can open, and a figure nobody may read the names behind would
// be a number lo was asking to be taken on trust.
app.get("/api/users/:username/followers", requireSession, (req, res) => {
  const target = namedUser(req, res);
  if (!target) return;
  res.json({ people: getFollowers(target.id, FOLLOWS_MAX) });
});

app.get("/api/users/:username/following", requireSession, (req, res) => {
  const target = namedUser(req, res);
  if (!target) return;
  res.json({ people: getFollowing(target.id, FOLLOWS_MAX) });
});

/* ------------------------------------------------------------- here and now */

// Place, timezone and sky in one answer: the clock and the weather card are two
// readings of the same moment, and asking twice would let them disagree.
//
// The list of components rides along, because it is a third reading of the same
// thing — which country the fix landed in decides what the page is even able to
// show, and the page should not have to ask a second time to find that out.
app.get("/api/local", async (req, res, next) => {
  const coords = parseCoords(req.query);
  if (!coords) return res.status(400).json({ error: "Invalid coordinates" });
  const lang = requestedLang(req);
  try {
    const [place, weather] = await Promise.allSettled([
      lookupPlace(coords.latitude, coords.longitude, lang),
      lookupWeather(coords.latitude, coords.longitude),
    ]);
    // Either half can be missing without making the other worthless — the map
    // still knows where it is when the weather service is down.
    const located = place.status === "fulfilled" ? place.value : null;
    res.json({
      place: located,
      weather: weather.status === "fulfilled" ? weather.value : null,
      // With no place there is no country, and componentsFor answers for nowhere
      // in particular: everything worldwide, nothing that stops at a border.
      components: componentsFor(located?.countryCode),
      failed: [
        place.status === "rejected" ? "place" : null,
        weather.status === "rejected" ? "weather" : null,
      ].filter(Boolean),
    });
  } catch (error) {
    next(error);
  }
});

// The country list itself, which is what every components list above is read
// out of: every country lo can find itself standing in, and the dashboard it
// would be able to build there.
app.get("/api/countries", (req, res) => {
  res.json({ components: COMPONENTS, countries: countryList(requestedLang(req)) });
});

app.get("/api/nearby", async (req, res, next) => {
  const coords = parseCoords(req.query);
  if (!coords) return res.status(400).json({ error: "Invalid coordinates" });
  try {
    res.json(await lookupNearby(coords.latitude, coords.longitude, requestedLang(req)));
  } catch (error) {
    if (isUpstreamDown(error)) return res.status(504).json({ error: "Timed out looking up what is nearby" });
    next(error);
  }
});

app.get("/api/events", async (req, res, next) => {
  const coords = parseCoords(req.query);
  if (!coords) return res.status(400).json({ error: "Invalid coordinates" });
  try {
    res.json(await lookupEvents(coords.latitude, coords.longitude, requestedLang(req)));
  } catch (error) {
    if (isUpstreamDown(error)) return res.status(504).json({ error: "Timed out looking up events" });
    next(error);
  }
});

// What there is to eat and to drink within walking distance. Two cards off one
// upstream, told apart by the amenities each asks OpenStreetMap about, so the
// route is written once and mounted twice — a second copy of it would differ
// from the first by a single word (see lookupVenues in geo.js).
function venuesRoute(kind) {
  return async (req, res, next) => {
    const coords = parseCoords(req.query);
    if (!coords) return res.status(400).json({ error: "Invalid coordinates" });
    try {
      const result = await lookupVenues(kind, coords.latitude, coords.longitude, requestedLang(req));
      // The upstream answer is cached independently of lo's own conversation
      // counts. Add the current figures after that cache, so a new comment is
      // visible on the next reading without another Overpass request and without
      // mutating the shared cached venue rows.
      const counts = getVenueCommentCounts(result.items.map((item) => item.id));
      res.json({
        ...result,
        items: result.items.map((item) => ({ ...item, comments: counts[item.id] ?? 0 })),
      });
    } catch (error) {
      if (isUpstreamDown(error)) {
        return res.status(504).json({ error: "Timed out looking up what is around here" });
      }
      next(error);
    }
  };
}

app.get("/api/food", venuesRoute("food"));
app.get("/api/cafe", venuesRoute("cafe"));

// Nearby articles, with their lead paragraph and a picture where Wikipedia has
// one. A landmark's comment thread is filed the same way an OSM venue's is —
// see VENUE_COMMENT_TYPES below — so the figure is added on the way out here
// exactly as it is for food and cafés.
app.get("/api/wikipedia", async (req, res, next) => {
  const coords = parseCoords(req.query);
  if (!coords) return res.status(400).json({ error: "Invalid coordinates" });
  try {
    const result = await lookupWikipedia(coords.latitude, coords.longitude, requestedLang(req));
    const counts = getVenueCommentCounts(result.items.map((item) => item.id));
    res.json({
      ...result,
      items: result.items.map((item) => ({ ...item, comments: counts[item.id] ?? 0 })),
    });
  } catch (error) {
    if (isUpstreamDown(error)) {
      return res.status(504).json({ error: "Timed out looking up nearby Wikipedia articles" });
    }
    next(error);
  }
});

// The reading behind one row, asked for by the row's own link, and the only
// place a story is ever fetched. The first reader to press a row waits about a
// second for it — Google's address has to be resolved before the publisher can
// be asked, which is two round trips before the page itself — and that wait is
// why the sheet has something to say while it opens. Everyone after them gets a
// file read, because the answer was kept.
//
// Nothing here is behind a session: it is the same public news the card is,
// already fetched and already sitting on the dashboard. What it will not do is
// fetch an arbitrary address on request — that would make lo a proxy for
// anything — so the link must be one of the feeds' own (see harvest).
app.get("/api/articles", async (req, res, next) => {
  const link = typeof req.query.link === "string" ? req.query.link : "";
  if (!link) return res.status(400).json({ error: "Invalid article" });
  try {
    const stored = await readStoredArticle(articleId(link));
    if (stored) return res.json(stored);

    const row = await harvest({
      url: link,
      title: typeof req.query.title === "string" ? req.query.title : null,
      source: typeof req.query.source === "string" ? req.query.source : null,
      time: null,
      kind: req.query.kind === "event" ? "event" : "news",
    });
    const fetched = row ? await readStoredArticle(row.id) : null;
    if (!fetched) return res.status(404).json({ error: "No reading stored for this one" });
    res.json(fetched);
  } catch (error) {
    next(error);
  }
});

app.get("/api/trends", async (req, res, next) => {
  const coords = parseCoords(req.query);
  if (!coords) return res.status(400).json({ error: "Invalid coordinates" });
  try {
    res.json(await lookupTrends(coords.latitude, coords.longitude, requestedLang(req)));
  } catch (error) {
    if (isUpstreamDown(error)) return res.status(504).json({ error: "Timed out looking up trends" });
    next(error);
  }
});

// No lang: the warnings come off a Japanese page in Japanese, and the card puts
// the reader's own words back on what it can name.
app.get("/api/warnings", async (req, res, next) => {
  const coords = parseCoords(req.query);
  if (!coords) return res.status(400).json({ error: "Invalid coordinates" });
  try {
    res.json(await lookupWarnings(coords.latitude, coords.longitude));
  } catch (error) {
    if (isUpstreamDown(error)) return res.status(504).json({ error: "Timed out looking up warnings" });
    next(error);
  }
});

/* ------------------------------------------------------------------- marks */

// Every one of these four is about one account's own list and nobody else's,
// which is why the list is a file in that account's folder rather than rows in a
// table (see users.js). They are addressed by name here instead of by id for the
// same reason: the folder is named after the account.

app.get("/api/marks", requireSession, (req, res) => {
  const parsedLimit = Number(req.query.limit);
  const limit = Number.isInteger(parsedLimit) ? Math.min(500, Math.max(1, parsedLimit)) : 200;
  res.json({ marks: readMarks(req.user.username, limit) });
});

// The same list as a file rather than as a page of it: the folder's own
// marks.json, which is the one thing in the zip most readers were ever after and
// the file the import below reads back.
//
// Its own address rather than the reading above with the limit taken off. What a
// page asks for and what a backup asks for are two different questions — one is
// as much of the list as a screen can hold and the other is all of it, always —
// and an endpoint that answered both would be one where the wrong caller gets the
// whole file by forgetting an argument.
app.get("/api/marks/export.json", requireSession, (req, res) => {
  res.json(readMarkFile(req.user.username));
});

// A spot is kept with what the reader gave it and nothing else. The name of the
// place used to be looked up here and written down beside it, in all three
// languages, so that a mark saved in one tap still read as somewhere; that is
// gone. A geocoder's line is where the phone was, not what the spot is — the
// reader marked a doorway and the list called it "Chiyoda · Tokyo", which is a
// name for several thousand other spots as well and for none of them well.
//
// So a mark with no name written on it is stored with none: its label empty in
// every language (see readLabel in users.js). What it is read by then is where it
// is — the coordinates, which are the truth about it and the one thing every mark
// has. Naming it stays the reader's to do, from the row in the list or from the
// sheet the save itself offers.
//
// The language on the request is still read, but for a different question than it
// used to answer. It said which language to look the place up in; it now says
// which language the reader typed the name in, and that is the one the name is
// written under.
app.post("/api/marks", requireSession, (req, res) => {
  const location = parseLocation(req.body);
  if (!location) return res.status(400).json({ error: "Invalid coordinates" });
  const label = String(req.body?.label ?? "").trim().normalize("NFKC");
  if (label.length > 48) return res.status(400).json({ error: "A name is at most 48 characters" });
  const suppliedTime = req.body?.time ? new Date(req.body.time) : new Date();
  if (Number.isNaN(suppliedTime.getTime())) return res.status(400).json({ error: "Invalid time" });

  const mark = saveMark(req.user.username, {
    ...location,
    time: suppliedTime.toISOString(),
    label,
    lang: requestedLang(req),
  });
  res.status(201).json({ mark });
});

// How big a marks.json may be on the way in. A spot is about 150 bytes written
// out, so this is a folder holding several thousand of them — past anything a
// person keeps by hand, and small enough that a file picked by mistake is turned
// away rather than read. It has a limit of its own because the body here is a
// file rather than a request: 32kb, which is the ceiling every JSON body in lo is
// held to, is about 200 marks and would refuse a perfectly ordinary list.
const MARKS_IMPORT_MAX = "1mb";

// A marks.json read back into the account it came out of — the other end of the
// export, and the only way a list of spots gets from one device, or one account,
// into another.
//
// The file arrives as its own text under its own parser, the way an image does
// and for the same reason. Said to be text rather than JSON so that the parse is
// done where it is known what a marks.json is meant to look like (see
// mergeMarks): a body parser that refused the file would leave the endpoint with
// nothing to say beyond "bad JSON", which is not what the reader picked a file
// to be told.
app.post(
  "/api/marks/import",
  requireSession,
  express.text({ type: () => true, limit: MARKS_IMPORT_MAX }),
  (req, res) => {
    const merged = mergeMarks(req.user.username, req.body);
    if (!merged) return res.status(400).json({ error: "That is not a marks.json" });
    res.json(merged);
  },
);

// Naming a spot, or renaming it, or taking its name off — in one language of it,
// the one the sheet was typed in. The rest of the name is left alone (see
// renameMark), which is why an empty box here is a language cleared rather than a
// spot made nameless.
app.patch("/api/marks/:markId", requireSession, (req, res) => {
  const markId = Number(req.params.markId);
  if (!Number.isInteger(markId) || markId < 1) return res.status(400).json({ error: "Invalid mark ID" });
  const label = String(req.body?.label ?? "").trim().normalize("NFKC");
  if (label.length > 48) return res.status(400).json({ error: "A name is at most 48 characters" });
  const mark = relabelMark(req.user.username, markId, label, requestedLang(req));
  if (!mark) return res.status(404).json({ error: "No such mark", code: "MARK_NOT_FOUND" });
  res.json({ mark });
});

// The list emptied, addressed at the list rather than at a mark in it — which is
// the difference between this and the line below, and the whole of what it is
// for: a file read in by mistake is undone here in one press instead of one press
// per spot it brought.
//
// Answered with what it let go rather than with 204, unlike the single delete.
// That one is pressed on a row the reader is looking at and the row going is the
// answer; this one is pressed on a count, and the count is what there is to say
// back. Not an error where the list was already empty: what was asked for is a
// list with nothing in it, and there is one.
app.delete("/api/marks", requireSession, (req, res) => {
  res.json({ removed: clearMarks(req.user.username), count: 0 });
});

app.delete("/api/marks/:markId", requireSession, (req, res) => {
  const markId = Number(req.params.markId);
  if (!Number.isInteger(markId) || markId < 1) return res.status(400).json({ error: "Invalid mark ID" });
  if (!removeMark(req.user.username, markId)) {
    return res.status(404).json({ error: "No such mark", code: "MARK_NOT_FOUND" });
  }
  res.status(204).end();
});

/* ------------------------------------------------------------------- posts */

const POST_BODY_MAX = 500;
// How far out the map asks for posts. The dashboard map opens on the street the
// reader is standing in, so anything past this is off the tile at every zoom
// they are likely to use — and asking for the whole world would put a pin in
// Lisbon on a map of Shibuya.
const POSTS_RADIUS_M = 50_000;

// Everyone's, not just the reader's: a post is left on the ground for whoever
// comes past it, which is the whole difference between a post and a mark.
app.get("/api/posts", requireSession, (req, res) => {
  const parsedLimit = Number(req.query.limit);
  const limit = Number.isInteger(parsedLimit) ? Math.min(500, Math.max(1, parsedLimit)) : 200;
  const coords = parseCoords(req.query);
  res.json({ posts: coords ? getPostsNear(coords, POSTS_RADIUS_M, limit) : getRecentPosts(limit) });
});

// What a post is allowed to hold, read the same way whether one is being written
// or rewritten. The two endpoints have to agree about it exactly — a rule that
// held only on the way in would be no rule at all — and the only way to be sure
// of that is for there to be one reading of it.
function readPostContent(payload) {
  const body = String(payload?.body ?? "").trim().normalize("NFKC");
  if (body.length > POST_BODY_MAX) return { error: `A post is at most ${POST_BODY_MAX} characters` };

  // The photo arrives as a name /api/images already wrote, never as bytes —
  // anything else would let this endpoint name a file of its own choosing. Both
  // names are read the same way: a thumbnail is an image stored the same way the
  // picture is, and the only thing that makes it one is what it is written into.
  const image = payload?.image ? String(payload.image) : null;
  if (image && !isStoredName(image)) return { error: "Invalid image" };
  const imageThumb = payload?.imageThumb ? String(payload.imageThumb) : null;
  if (imageThumb && !isStoredName(imageThumb)) return { error: "Invalid image" };
  if (!body && !image) return { error: "Write something, or add a picture" };

  const dimension = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
  };
  return {
    content: {
      body,
      image,
      // A thumbnail is a thumbnail *of* something, so it goes only where there
      // is a picture for it to stand in for — a post that has just had its photo
      // taken off it must not keep the small copy of it.
      imageThumb: image ? imageThumb : null,
      imageWidth: dimension(payload?.imageWidth),
      imageHeight: dimension(payload?.imageHeight),
    },
  };
}

app.post("/api/posts", requireSession, async (req, res, next) => {
  const location = parseLocation(req.body);
  if (!location) return res.status(400).json({ error: "Invalid coordinates" });
  const { content, error } = readPostContent(req.body);
  if (error) return res.status(400).json({ error });

  const suppliedTime = req.body?.time ? new Date(req.body.time) : new Date();
  if (Number.isNaN(suppliedTime.getTime())) return res.status(400).json({ error: "Invalid time" });

  try {
    // Looked up here rather than trusted from the client, for the same reason a
    // mark's is: the place name is what the post is filed under, and it should
    // read the same however the post was made.
    const place = await lookupPlace(location.latitude, location.longitude, requestedLang(req)).catch(() => null);
    const post = createPost(req.user.id, {
      ...location,
      ...content,
      time: suppliedTime.toISOString(),
      place: placeLine(place),
    });
    res.status(201).json({ post });
  } catch (requestError) {
    next(requestError);
  }
});

// Rewriting one of your own. Only the words and the photo: where and when the
// post was left are what it is filed under, and an edit that could move the pin
// would let a post claim ground its author never stood on. It is the same line a
// mark draws, which can be renamed and not re-placed — and it is why nothing
// here goes back to the geocoder, since the ground has not changed.
//
// Somebody else's post is answered as a missing one rather than as a forbidden
// one: the UPDATE is by id *and* author, so a post nobody may edit and a post
// that is not there are the same row count coming back.
app.patch("/api/posts/:postId", requireSession, (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID" });
  const { content, error } = readPostContent(req.body);
  if (error) return res.status(400).json({ error });

  // The photo it was carrying stays on disk: it is named after its own bytes, so
  // another post may be pointing at the same file — the same reason deleting a
  // post leaves it alone.
  const post = updatePost(req.user.id, postId, content);
  if (!post) return res.status(404).json({ error: "No such post", code: "POST_NOT_FOUND" });
  res.json({ post });
});

app.delete("/api/posts/:postId", requireSession, (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID" });
  // The image file stays: it is named after its own bytes, so another post may
  // be pointing at the same one.
  if (!deletePost(req.user.id, postId)) {
    return res.status(404).json({ error: "No such post", code: "POST_NOT_FOUND" });
  }
  res.status(204).end();
});

/* ---------------------------------------------------------------- comments */

// A comment is a remark rather than a post: it is read in a column under
// something else and it has no ground of its own to be about, so it gets a
// fraction of the room a post does. Long enough for a sentence or three, short
// enough that a hundred of them under one photo is still a list.
const COMMENT_BODY_MAX = 300;
// How many the sheet will draw. Far past what any post on lo has, and there for
// the reason every other limit in here is: a list is answered in one response,
// so it has to have an end.
const COMMENTS_MAX = 200;

// The post a comment endpoint is about, or nothing — both of them start by
// asking whether there is anything here to be talking about, and a post that has
// been taken down is not one anybody may write under.
function commentTarget(req, res) {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) {
    res.status(400).json({ error: "Invalid post ID" });
    return null;
  }
  const post = getPost(postId);
  if (!post) {
    res.status(404).json({ error: "No such post", code: "POST_NOT_FOUND" });
    return null;
  }
  return post;
}

// Everyone's, like the post they hang off: what was said back about something
// left on the ground is part of what a passer-by finds there.
//
// And asking for it is what marks it read, exactly as asking for a conversation
// is (see /api/messages/:username below): a column somebody has just been shown
// is one they have seen, and lo has no button anywhere for saying so. The unread
// figure comes back already counted down by this reading, so the dot in the bar
// goes out as the words arrive rather than on the bar's next beat.
app.get("/api/posts/:postId/comments", requireSession, (req, res) => {
  const post = commentTarget(req, res);
  if (!post) return;
  readComments(req.user.id, post.id);
  res.json({ comments: getComments(post.id, COMMENTS_MAX), unread: countUnread(req.user.id) });
});

// Under anybody's post, including your own: a writer answering the people who
// came past is the ordinary shape of one of these columns, and a rule against it
// would be lo deciding who is allowed to finish a conversation.
app.post("/api/posts/:postId/comments", requireSession, (req, res) => {
  const post = commentTarget(req, res);
  if (!post) return;
  const body = String(req.body?.body ?? "").trim().normalize("NFKC");
  // No photo and so nothing to stand in for the words: an empty comment is
  // somebody pressing the button twice, not a post with a picture in it.
  if (!body) return res.status(400).json({ error: "Write something" });
  if (body.length > COMMENT_BODY_MAX) {
    return res.status(400).json({ error: `A comment is at most ${COMMENT_BODY_MAX} characters` });
  }
  // The row and the figure it has just changed, because they are read by two
  // different things on screen — the column in the sheet and the count in the
  // corner of the bubble on the map (see createComment in db.js).
  const { comment, count } = createComment(req.user.id, post.id, body);
  res.status(201).json({ comment, comments: count });
});

// OSM numbers nodes, ways and relations in separate spaces, and Wikipedia
// numbers its pages in a fourth of its own — `wikipedia` joins the three here
// for the same reason lookupWikipedia namespaces its ids that way (see
// geo.js): a landmark is a place to leave a word about exactly as a café is,
// and there is no third comment table to keep in step with a second kind of
// place. The pair is the stable identity the venue and Wikipedia cards already
// carry (`node/123`, `wikipedia/456`), and spelling it as two path segments
// avoids relying on an encoded slash surviving every proxy between the app and
// Express.
const VENUE_COMMENT_TYPES = new Set(["node", "way", "relation", "wikipedia"]);

function venueCommentTarget(req, res) {
  const type = String(req.params.type ?? "");
  const osmId = String(req.params.osmId ?? "");
  if (!VENUE_COMMENT_TYPES.has(type) || !/^[1-9]\d{0,19}$/.test(osmId)) {
    res.status(400).json({ error: "Invalid venue ID" });
    return null;
  }
  return `${type}/${osmId}`;
}

// Venue columns are public like post columns, but they do not participate in
// the personal inbox: an OSM place has no author to notify. Opening one simply
// reads the shared column as it stands.
app.get("/api/venues/:type/:osmId/comments", requireSession, (req, res) => {
  const venueId = venueCommentTarget(req, res);
  if (!venueId) return;
  res.json({ comments: getVenueComments(venueId, COMMENTS_MAX) });
});

app.post("/api/venues/:type/:osmId/comments", requireSession, (req, res) => {
  const venueId = venueCommentTarget(req, res);
  if (!venueId) return;
  const body = String(req.body?.body ?? "").trim().normalize("NFKC");
  if (!body) return res.status(400).json({ error: "Write something" });
  if (body.length > COMMENT_BODY_MAX) {
    return res.status(400).json({ error: `A comment is at most ${COMMENT_BODY_MAX} characters` });
  }
  const { comment, count } = createVenueComment(req.user.id, venueId, body);
  res.status(201).json({ comment, comments: count });
});

/* ---------------------------------------------------------------- messages */

// A message is a letter rather than a remark, so it gets the room a letter
// needs. Still bounded: everything in lo that can be typed has an end, and this
// is about as much as anybody reads inside a sheet without scrolling twice.
const MESSAGE_BODY_MAX = 1000;
// How many correspondents the inbox draws, and how much of one exchange is read
// back. The exchange is capped at its *end* rather than its beginning (see
// selectConversation in db.js) — a long correspondence opens on the part of it
// that is still being had.
const INBOX_MAX = 50;
const CONVERSATION_MAX = 200;

// The inbox, and the figure the top bar's letter wears, in one answer. They are
// one reading of the same table — the dot says somebody wrote and the list is
// who — so asking twice would let the row of names disagree with the mark over
// it. Asked for when the sheet opens rather than on a beat: the dot is what says
// whether opening it is worth doing, and that rides in on the presence trade
// already turning every minute (see /api/people).
app.get("/api/messages", requireSession, (req, res) => {
  res.json({ conversations: getThreads(req.user.id, INBOX_MAX), unread: countUnread(req.user.id) });
});

// The person a message endpoint is about, or nothing. Writing to yourself is
// refused in words rather than left to the table's own CHECK, for the reason
// following yourself is: neither is a request any browser of ours sends, and the
// server is the copy of the rule that holds whatever asks.
function messageTarget(req, res) {
  const target = namedUser(req, res);
  if (!target) return null;
  if (target.id === req.user.id) {
    res.status(400).json({ error: "You cannot message yourself" });
    return null;
  }
  return target;
}

// One exchange, both directions, oldest first — and asking for it is what marks it
// read. There is no button for that: a conversation somebody has just been shown
// is one they have seen, and a sheet that made the reader press something
// afterwards would be asking them to file their own post.
//
// Which is why this is also the request an open sheet repeats every few seconds
// (see MessageModal): a line that arrives in front of a reader who already has the
// thread up has been seen just as plainly as one they opened the thread to find,
// and the same answer carries that fact back to whoever wrote it — every line in
// the reply says whether the far side has had it in front of them.
//
// The unread figure comes back with it, already counted down by this reading, so
// the dot in the bar goes out at the same moment the words arrive rather than on
// the bar's next beat.
app.get("/api/messages/:username", requireSession, (req, res) => {
  const target = messageTarget(req, res);
  if (!target) return;
  readConversation(req.user.id, target.id);
  res.json({
    user: { username: target.username, avatar: target.avatar },
    messages: getConversation(req.user.id, target.id, CONVERSATION_MAX),
    unread: countUnread(req.user.id),
  });
});

// Anybody may write to anybody: a name in lo is a public address — it is what
// every list of people links to — and following is one-way, so there is no
// arrangement between two accounts for this to be gated on.
app.post("/api/messages/:username", requireSession, (req, res) => {
  const target = messageTarget(req, res);
  if (!target) return;
  const body = String(req.body?.body ?? "").trim().normalize("NFKC");
  if (!body) return res.status(400).json({ error: "Write something" });
  if (body.length > MESSAGE_BODY_MAX) {
    return res.status(400).json({ error: `A message is at most ${MESSAGE_BODY_MAX} characters` });
  }
  // The line as the sheet will draw it, which is the row plus which side of the
  // conversation it hangs on — so a sent message lands in the column without the
  // whole exchange being asked for again.
  res.status(201).json({ message: createMessage(req.user.id, target.id, body) });
});

// A whole exchange taken down from the inbox: the list is of conversations, so a
// row's delete removes the conversation rather than one line of it. Soft — every
// message is stamped rather than removed (see deleteConversation in db.js) — and
// an exchange with nobody at the far end is a target not found.
app.delete("/api/messages/:username", requireSession, (req, res) => {
  const target = messageTarget(req, res);
  if (!target) return;
  deleteConversation(req.user.id, target.id);
  res.status(204).end();
});

/* ------------------------------------------------------------------ images */

// The bytes arrive already compressed to WebP by the browser, which is what
// keeps lo free of an image library — every browser that can show the map can
// also encode a canvas — and means the wire carries the small file rather than
// the 8 MB one off a phone.
app.post(
  "/api/images",
  requireSession,
  express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
  async (req, res, next) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "The image is empty" });
    }
    try {
      const stored = await storeImage(req.body);
      if (!stored) return res.status(415).json({ error: "Unsupported image format" });
      res.json(stored);
    } catch (error) {
      next(error);
    }
  },
);

// Behind the session like everything else, which an <img> tag cannot satisfy on
// its own — it makes its own request and there is nowhere on it to put a header.
// So the client never points a tag straight here: `authImageUrl` fetches the
// bytes with the header and hands the tag an object URL instead.
app.get("/api/images/:name", requireSession, (req, res) => {
  const file = imageFile(req.params.name);
  if (!file) return res.status(400).json({ error: "Invalid image name" });
  res.sendFile(
    file.path,
    {
      headers: {
        "Content-Type": file.type,
        // Content-addressed, so the bytes behind a name never change.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    },
    (error) => {
      if (!error || res.headersSent) return;
      if (error.code === "ENOENT") return res.status(404).json({ error: "No such image" });
      res.status(500).json({ error: "Server error" });
    },
  );
});

/* ----------------------------------------------------------------- presence */

// How long a published fix still counts as "where someone is". The client
// republishes every minute while its tab is open, so anything this old means
// the tab is closed, asleep or out of signal — and a dot for it would be a
// claim lo cannot stand behind.
const PRESENCE_WINDOW_MS = 10 * 60 * 1000;

function livePeople(userId) {
  return getOtherPositions(userId, new Date(Date.now() - PRESENCE_WINDOW_MS).toISOString());
}

// Who else is out — and how much is waiting to be read, which has nothing to do
// with where anybody is standing and rides along anyway: the dot on the letter
// in the top bar has to keep itself current, and this is the one loop already
// turning every minute. A poller of its own would be a second beat asking a
// question this one can answer for free.
app.get("/api/people", requireSession, (req, res) => {
  res.json({ people: livePeople(req.user.id), unread: countUnread(req.user.id) });
});

// Telling the server where you are and asking who else is out are the same
// question a minute apart, so they are one round trip rather than two.
app.put("/api/position", requireSession, (req, res) => {
  const location = parseLocation(req.body);
  if (!location) return res.status(400).json({ error: "Invalid coordinates" });
  savePosition(req.user.id, location);
  res.json({ people: livePeople(req.user.id), unread: countUnread(req.user.id) });
});

// Everything a screen standing at one spot opens with, in one answer: where this
// is, its weather, whichever of the regional components that country has, the
// posts within reach and who else is about. The parts are all readable one at a
// time above, and the website reads them that way because its cards arrive
// separately; this is for a reader that cannot afford the round trips. It takes a
// fix in the body rather than the query because it also files one — the same
// trade PUT /api/position makes, a position given for the positions back.
app.post("/api/dashboard", requireSession, async (req, res, next) => {
  const location = parseLocation(req.body);
  if (!location) return res.status(400).json({ error: "Invalid coordinates" });
  const lang = requestedLang(req);
  try {
    savePosition(req.user.id, location);
    const [placeAnswer, weatherAnswer] = await Promise.allSettled([
      lookupPlace(location.latitude, location.longitude, lang),
      lookupWeather(location.latitude, location.longitude),
    ]);
    const place = placeAnswer.status === "fulfilled" ? placeAnswer.value : null;
    const components = componentsFor(place?.countryCode);

    const [nearbyAnswer, eventsAnswer, trendsAnswer] = await Promise.allSettled([
      components.includes("nearby")
        ? lookupNearby(location.latitude, location.longitude, lang)
        : Promise.resolve({ items: [] }),
      components.includes("events")
        ? lookupEvents(location.latitude, location.longitude, lang)
        : Promise.resolve({ items: [] }),
      components.includes("trends")
        ? lookupTrends(location.latitude, location.longitude, lang)
        : Promise.resolve({ items: [] }),
    ]);

    res.json({
      local: {
        place,
        weather: weatherAnswer.status === "fulfilled" ? weatherAnswer.value : null,
        components,
        failed: [
          placeAnswer.status === "rejected" ? "place" : null,
          weatherAnswer.status === "rejected" ? "weather" : null,
        ].filter(Boolean),
      },
      nearby: nearbyAnswer.status === "fulfilled" ? nearbyAnswer.value?.items ?? [] : [],
      events: eventsAnswer.status === "fulfilled" ? eventsAnswer.value?.items ?? [] : [],
      trends: trendsAnswer.status === "fulfilled" ? trendsAnswer.value?.items ?? [] : [],
      posts: getPostsNear(location, POSTS_RADIUS_M, 20),
      people: livePeople(req.user.id),
    });
  } catch (error) {
    next(error);
  }
});

if (isProduction) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.use((error, req, res, _next) => {
  if (res.headersSent) return;
  // A body over the limit is the sender's answer to give, not a fault worth a
  // stack trace in the log — a phone photo that failed to compress is the usual
  // way one gets here.
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "File too large" });
  }
  // Nor is an upstream that never answered. The routes that can say something
  // specific about which card went without already have (see isUpstreamDown);
  // this is for the rest of them, and for articles.js, which fetches for itself
  // and so arrives here as the raw TypeError rather than as a tidied one.
  if (isUpstreamDown(error)) {
    console.warn(`upstream: ${error.message}`);
    return res.status(504).json({ error: "An upstream service did not answer" });
  }
  console.error(error);
  res.status(500).json({ error: "Server error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`lo listening on:`);
  console.log(`  Local:   http://localhost:${port}`);
  for (const iface of Object.values(os.networkInterfaces()).flat()) {
    if (iface?.family === "IPv4" && !iface.internal) {
      console.log(`  Network: http://${iface.address}:${port}`);
    }
  }
});
