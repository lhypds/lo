import * as api from "../api.js";

// The reader's own answers about how lo is shown to them, kept for the account
// as well as for the browser: data/users/<name>/settings.json on the server (see
// server/users.js), and localStorage in here.
//
// Both copies, and in that order. The stores next door — the scale the weather
// is in, the shape of the dashboard, which face of the map — read from
// localStorage as they are imported, which is what makes the first paint the page
// the reader left rather than a default one that corrects itself a moment later.
// Nothing here is on the path to that paint. What this is for is the second
// device: signing in hands the account's answers over, the stores adopt them,
// and a press on either device is written up so the other one has it next time.
//
// No store depends on this module having anything to say. A reader with no
// session, a server that cannot be reached, storage walled off in a private
// frame: in every one of those the dashboard is still the shape it was left in,
// because the answers were never only up there.
const fields = new Map();

// Whose answers these are, and the empty string when nobody is signed in — which
// is also the switch that stops anything being sent. A signed-out reader still
// decides things about lo; there is simply no account to write them against.
let account = "";

// What came down with the session, held because the stores do not all exist yet
// when it arrives: the map is loaded lazily on the two screens that draw one (see
// MapCard), so its answer has to wait here until the module that owns it turns up.
let handed = null;

// The patch waiting to go out, and the beat it goes out on. Answers arrive in
// bursts — a size pressed three times is three decisions about one card — and
// each of these is a whole field, so the last one written is the one that counts:
// a queue would be three requests saying the same thing.
let queued = null;
let timer = null;
const SETTLE_MS = 600;

// One field of settings.json, owned by the store that keeps it. `read` is what
// this browser currently holds, for the first sign-in on an account that has
// never saved anything; `adopt` is that store taking the account's answer, which
// must not come back through noteSetting below — that is the loop.
export function registerSetting(name, { read, adopt }) {
  fields.set(name, { read, adopt });
  // A store that arrived after the session did takes its answer on the way in,
  // so a lazily loaded card is not the one tile reading the wrong file.
  if (handed && name in handed) adopt(handed[name]);
}

function send() {
  timer = null;
  const patch = queued;
  queued = null;
  if (!account || !patch) return;
  api.saveSettings(patch).catch(() => {
    // Dropped rather than retried. Every one of these is also in localStorage, so
    // what a failed save costs is this answer not reaching the reader's other
    // devices until the next time they change it — and a queue that kept trying
    // would be a queue that could send yesterday's answer over today's.
  });
}

// A store saying the reader has just decided something. Nothing is sent for a
// reader with no session, and nothing is sent for an adopted answer: this is the
// reader's own press and only the reader's own press.
export function noteSetting(name, value) {
  if (!account) return;
  queued = { ...queued, [name]: value };
  if (timer === null) timer = setTimeout(send, SETTLE_MS);
}

// Everything the stores are holding, as the object the file keeps. Sent whole on
// the one occasion it is right to send it whole: the first sign-in on an account
// with no settings.json, where the browser's answers are the only answers there
// are and the account is better off adopting them than handing back blanks.
function offer() {
  const settings = {};
  for (const [name, field] of fields) settings[name] = field.read();
  return settings;
}

// A session has arrived — from the login screen, from a link, or from the token
// this browser was already holding. `settings` is the account's file, or null
// where it has never saved one.
export function adoptSettings(username, settings) {
  account = username || "";
  handed = settings ?? null;
  if (!account) return;
  if (!settings) {
    // Nothing kept for this account yet, so this browser's answers become its
    // answers. Straight out rather than on the beat: it is one request per
    // account, ever, and it is the request that stops the next device starting
    // from defaults.
    queued = { ...queued, ...offer() };
    if (timer !== null) clearTimeout(timer);
    timer = null;
    send();
    return;
  }
  for (const [name, field] of fields) {
    if (name in settings) field.adopt(settings[name]);
  }
}

// Signed out. The stores keep what they are showing — the reader has not asked
// for a different dashboard, only to stop being this account — and this stops
// anything further being written against a session that has ended.
export function forgetSettings() {
  account = "";
  handed = null;
  queued = null;
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
