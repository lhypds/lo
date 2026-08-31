#!/usr/bin/env node
// Admin helper for the things the users table has no screen for (see
// VITE_ADMIN_EMAIL in .env.example) — reading who is here, and opening and
// closing an account by hand.
//
//   npx lo user list
//   npx lo user add <username> <password>
//   npx lo user delete <username>

import { createUser, deleteUser, getUser, listUsers } from "./server/db.js";
import { countMarks, isSafeName } from "./server/users.js";

const USAGE = `Usage:
  lo user list
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
  fail(USAGE);
}
