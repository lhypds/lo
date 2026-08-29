#!/usr/bin/env node
// Admin helper for the things the users table has no screen for (see
// VITE_ADMIN_EMAIL in .env.example) — starting with opening and closing an
// account by hand.
//
//   npx lo user add <username> <password>
//   npx lo user delete <username>

import { createUser, deleteUser, getUser } from "./server/db.js";

const USAGE = `Usage:
  lo user add <username> <password>
  lo user delete <username>`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [group, action, ...rest] = process.argv.slice(2);

if (group !== "user" || !action) fail(USAGE);

if (action === "add") {
  const [username, password] = rest;
  if (!username || !password) fail(USAGE);
  if (getUser(username)) fail(`"${username}" already exists`);
  createUser(username, password);
  console.log(`Added ${username}`);
} else if (action === "delete") {
  const [username] = rest;
  if (!username) fail(USAGE);
  if (!deleteUser(username)) fail(`"${username}" does not exist`);
  console.log(`Deleted ${username}`);
} else {
  fail(USAGE);
}
