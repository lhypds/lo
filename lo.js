#!/usr/bin/env node
// Admin helper for the things the users table has no screen for (see
// VITE_ADMIN_EMAIL in .env.example) — reading who is here, and opening and
// closing an account by hand.
//
//   npx lo user list
//   npx lo user <username>
//   npx lo user add <username> <password>
//   npx lo user delete <username>

import { createUser, deleteUser, getUser, getUserDetail, listUsers } from "./server/db.js";
import { countMarks, getSettings, isSafeName } from "./server/users.js";

const USAGE = `Usage:
  lo user list
  lo user <username>
  lo user add <username> <password>
  lo user delete <username>`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

// The same name the website would have made of it: trimmed, composed, and lower
// case, because an account's name is its address — /<name> — and one typed at a
// shell has to come out the same as one typed into the login screen, not a second
// account beside it.
function normalize(value) {
  return String(value ?? "").trim().normalize("NFKC").toLowerCase();
}

// How wide a cell lands on the screen, which is not how many characters are in
// it: a name may be CJK (see isSafeName), and one of those takes two columns of
// a terminal. A table padded by length alone comes out straight for everybody
// called alice and ragged from the first name that is not.
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]|[\u{20000}-\u{3FFFD}]/u;

function width(text) {
  let columns = 0;
  for (const character of text) columns += WIDE.test(character) ? 2 : 1;
  return columns;
}

function pad(text, columns, align) {
  const spaces = " ".repeat(Math.max(columns - width(text), 0));
  return align === "right" ? spaces + text : text + spaces;
}

// UTC, as the columns are written. These are read against each other rather than
// against the reader's own clock — the question is which accounts have been back
// lately, not what the hour was where they were — and a column of times all off
// one clock answers it without anybody having to know whose.
function day(stamp) {
  return stamp ? stamp.slice(0, 10) : "never";
}

function minute(stamp) {
  return stamp ? `${stamp.slice(0, 10)} ${stamp.slice(11, 16)}` : "never";
}

/* -------------------------------------------------------------- one account */

// A sheet about one account is read down rather than across, so the values start
// at a column of their own and the labels sit in the margin: what the eye runs
// down is the right-hand side, and a label is there for the line it cannot
// place. Wide enough for the longest of them with a gap after it.
const LABEL = 11;

// What an empty field comes to. The account's own block has a word for each of
// its blanks — "never", "none", "no device" — because each of those is a
// different kind of nothing and reads as a sentence about the account. A profile
// field has only the one kind, and nine lines of "not filled in" is a wall of the
// same sentence; the dash is the mark the roster already puts under "from" for an
// address lo never made out.
const EMPTY = "—";

function line(label, value) {
  console.log(`  ${pad(label, LABEL)}${value}`.trimEnd());
}

// A value that is several — the links, and a bio somebody wrote in paragraphs.
// The label goes on the first of them and the rest come in under the same
// column, which is what makes four links read as one answer rather than four.
function block(label, values) {
  values.forEach((value, index) => line(index === 0 ? label : "", value));
}

// Four decimals is about ten metres, which is finer than the fix behind it ever
// is and short enough to be read off a screen and typed into a map.
function place(latitude, longitude) {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

// And how well the device knew, which is the half of a fix the coordinates
// cannot say: ten metres and ten kilometres are printed alike above, and only
// this tells whether the line means a doorway or the district it is in. The
// browser's own words for it (see formatAccuracy in src/utils/format.js) — the
// same figure is on screen beside the reader's own dot, and a person holding the
// two against each other should not have to convert between them.
//
// Nothing at all where the fix arrived without one, which is a device declining
// to say rather than a fix good to zero metres: the blank is the answer.
function spread(meters) {
  if (!Number.isFinite(meters)) return "";
  return meters < 1000 ? ` ±${Math.round(meters)} m` : ` ±${(meters / 1000).toFixed(1)} km`;
}

function count(number, one, many) {
  return `${number} ${number === 1 ? one : many}`;
}

// How lo is shown to this account, as the one line it comes to: the clock, the
// scale, the face of the map, the language and how much of the dashboard has
// been moved about. An account with no settings.json has never answered any of
// it — which is not the same as having chosen the defaults, and says so.
function shown(settings) {
  if (!settings) return "nothing saved";
  const cards = Object.keys(settings.layout).length;
  return [
    settings.units.hour12 ? "12-hour" : "24-hour",
    settings.units.fahrenheit ? "Fahrenheit" : "Celsius",
    `${settings.mapStyle} map`,
    settings.lang ?? "the browser's language",
    cards > 0 ? count(cards, "card arranged", "cards arranged") : null,
  ]
    .filter(Boolean)
    .join(", ");
}

// Everywhere else the account keeps one, a row each: what they call the place
// and the address they gave for it. One with no address is left out rather than
// printed as a word with nothing after it — the column is written whole by the
// sheet that saves it and lo has never looked inside it, so what comes back here
// is whatever a browser put there.
function links(kept) {
  const rows = kept
    .map((link) => ({ kind: String(link?.kind ?? "").trim() || "link", value: String(link?.value ?? "").trim() }))
    .filter((link) => link.value);
  const columns = Math.max(0, ...rows.map((link) => width(link.kind)));
  return rows.map((link) => `${pad(link.kind, columns)}  ${link.value}`);
}

// Everything lo is holding on one account, in the order somebody reading about a
// person asks for it: how they stand with lo, then what they have put up about
// themselves, then what they have left behind.
//
// Every line of all three blocks is printed, "never" and the dash included, so
// that two accounts read side by side have the same shape and a blank is an
// answer rather than a missing row. A label with nothing after it says the field
// was left empty, which is worth knowing about a profile — a label that is not
// there at all says nothing, and reads as lo having declined to look.
function show(detail) {
  // The name as the row spells it rather than as it was typed at the shell: the
  // column is unique without regard to case, so Alice and alice are one account,
  // and the one with the capital on it is the one that was opened.
  console.log(detail.username);
  line("opened", day(detail.createdAt));
  line("sign-in", detail.lastLoginAt ? `${minute(detail.lastLoginAt)} from ${detail.lastIp ?? "somewhere"}` : "never");
  // When first and where second, which is how the line above it reads as well:
  // the two are the same question about two kinds of appearance, and a stamp at
  // the front of both is what lets one be held against the other.
  //
  // Both halves of the fix or neither, since a fix is a pair: an account carrying
  // one number and not the other is a row half-written, and half a position is
  // not somewhere.
  const fix = detail.lastLatitude != null && detail.lastLongitude != null;
  const at = fix ? `${place(detail.lastLatitude, detail.lastLongitude)}${spread(detail.lastAccuracy)}` : null;
  line("last fix", at ? `${minute(detail.lastPositionAt)} at ${at}` : "never");
  // The password as it stands, which is what whoever runs this was almost
  // certainly asked for (see the note on the column in db.js). Null is an account
  // whose password is still to be chosen — by its owner, at the next sign-in —
  // rather than one with an empty password.
  line("password", detail.password ?? "not chosen yet");
  line("link", detail.hasLink ? "one standing" : "none");
  line("on the map", detail.discoverable ? "yes" : "hidden");
  line("signed in", detail.sessions > 0 ? count(detail.sessions, "device", "devices") : "no device");

  const profile = [
    ["bio", String(detail.bio ?? "").split("\n")],
    ["work", [detail.work]],
    ["email", [detail.email]],
    ["website", [detail.website]],
    ["line", [detail.line]],
    ["whatsapp", [detail.whatsapp]],
    ["wechat", [detail.wechat]],
    ["avatar", [detail.avatar]],
    // The kind is the reader's own word for wherever it is (see the links
    // column), so it is printed as it was written rather than looked up — and
    // padded to the widest of them, since one of those words may be CJK and the
    // addresses beside them are what the block is read for.
    ["links", links(detail.links)],
  ].map(([label, values]) => {
    // The empty ones dropped from inside a field rather than from the sheet: a
    // bio's blank lines are not rows of it, and a link with a name and no address
    // is not one either. A field left with nothing at all after that is a field
    // nobody filled in, and gets the dash and its label like any other.
    const filled = values.filter((value) => String(value ?? "").trim());
    return [label, filled.length > 0 ? filled : [EMPTY]];
  });
  console.log("");
  for (const [label, values] of profile) block(label, values);

  console.log("");
  line("posts", String(detail.posts));
  // The one figure here that is not a row of the database: marks are the lines in
  // the account's own marks.json (see users.js), and a name the folder could not
  // be called has no file to count — which cannot happen to an account opened by
  // lo, and is still not a crash.
  line("marks", isSafeName(detail.username) ? String(countMarks(detail.username)) : "unreadable folder name");
  line("comments", String(detail.comments));
  line("followers", String(detail.followers));
  line("following", String(detail.following));
  line("messages", `${detail.sent} sent, ${detail.received} received, ${detail.unread} unread`);

  console.log("");
  line("settings", isSafeName(detail.username) ? shown(getSettings(detail.username)) : "unreadable folder name");
}

const [group, action, ...rest] = process.argv.slice(2);

if (group !== "user" || !action) fail(USAGE);

if (action === "list") {
  const users = listUsers();
  if (users.length === 0) {
    console.log("No accounts");
  } else {
    // Both figures for what an account has left behind, read off the two shelves
    // they live on: the posts came with the row, and the marks are the lines in
    // the account's own marks.json (see countMarks), because a mark is private
    // and has no table to be counted in. One file opened per account, which is
    // nothing at the size a list read by hand ever is.
    //
    // The last cell is what is unusual about an account rather than a field of
    // it: most have neither word in it, and empty there is the ordinary case.
    const rows = users.map((user) => [
      user.username,
      day(user.createdAt),
      minute(user.lastLoginAt),
      user.lastIp ?? "—",
      String(user.posts),
      String(countMarks(user.username)),
      [user.hasPassword ? null : "no password", user.discoverable ? null : "hidden"].filter(Boolean).join(", "),
    ]);
    // The figures right, everything else left, and the widths taken off the
    // header as well so a column is never narrower than the word above it.
    const table = [["name", "opened", "last sign-in", "from", "posts", "marks", ""], ...rows];
    const widths = table[0].map((_, column) => Math.max(...table.map((row) => width(row[column]))));
    const align = (column) => (column === 4 || column === 5 ? "right" : "left");
    for (const row of table) {
      console.log(row.map((cell, column) => pad(cell, widths[column], align(column))).join("  ").trimEnd());
    }
  }
} else if (action === "add") {
  const [name, password] = rest;
  if (!name || !password) fail(USAGE);
  const username = normalize(name);
  // A name the account's own folder cannot be called is not a name to open an
  // account under: the marks and the settings live in data/users/<name> (see
  // server/users.js), and an account whose name has a slash or a dot in it is one
  // whose things have nowhere to go.
  if (!isSafeName(username)) {
    fail(`"${name}" is not a usable username: 1–32 characters, letters, digits, CJK, - and _`);
  }
  if (getUser(username)) fail(`"${username}" already exists`);
  createUser(username, password);
  console.log(`Added ${username}`);
} else if (action === "delete") {
  const [name] = rest;
  if (!name) fail(USAGE);
  const username = normalize(name);
  if (!deleteUser(username)) fail(`"${username}" does not exist`);
  console.log(`Deleted ${username}`);
} else {
  // Anything that is not one of the three words above is read as a name, which
  // is what makes the common reading the short one: `lo user alice` rather than
  // `lo user show alice`. The cost is that the three words win over an account
  // called one of them — a name lo would let somebody register — and a roster
  // that cannot be listed is worse than a single account that has to be read out
  // of `lo user list`.
  const [extra] = rest;
  if (extra) fail(USAGE);
  const username = normalize(action);
  const detail = getUserDetail(username);
  if (!detail) fail(`"${username}" does not exist`);
  show(detail);
}
