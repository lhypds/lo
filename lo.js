#!/usr/bin/env node
// Admin helper for the things the users table has no screen for (see
// VITE_ADMIN_EMAIL in .env.example) — starting with opening and closing an
// account by hand.
//
//   npx lo user add <username> <password>
//   npx lo user delete <username>

import { createUser, deleteUser, getUser } from "./server/db.js";
import { isSafeName } from "./server/users.js";

const USAGE = `Usage:
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

const [group, action, ...rest] = process.argv.slice(2);

if (group !== "user" || !action) fail(USAGE);

if (action === "add") {
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
