import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(__dirname, "..", "db.sqlite");

export const db = new DatabaseSync(databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    time TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    label TEXT,
    place TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS marks_user_time_idx ON marks(user_id, time DESC);

  -- Where each account is right now, one row per user and overwritten in place:
  -- this is presence, not history. Marks are the table that keeps things.
  CREATE TABLE IF NOT EXISTS positions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS positions_updated_idx ON positions(updated_at DESC);
`);

const selectUserByName = db.prepare(`
  SELECT id, username, created_at AS createdAt
  FROM users
  WHERE username = ?
`);

const insertUser = db.prepare(`
  INSERT INTO users (username)
  VALUES (?)
`);

const countMarksForUser = db.prepare(`
  SELECT COUNT(*) AS count
  FROM marks
  WHERE user_id = ?
`);

const insertMark = db.prepare(`
  INSERT INTO marks (user_id, time, latitude, longitude, accuracy, label, place)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const selectMarkById = db.prepare(`
  SELECT id, time, latitude, longitude, accuracy, label, place
  FROM marks
  WHERE id = ? AND user_id = ?
`);

const selectMarks = db.prepare(`
  SELECT id, time, latitude, longitude, accuracy, label, place
  FROM marks
  WHERE user_id = ?
  ORDER BY time DESC, id DESC
  LIMIT ?
`);

const updateMarkLabel = db.prepare(`
  UPDATE marks
  SET label = ?
  WHERE id = ? AND user_id = ?
`);

const deleteMarkById = db.prepare(`
  DELETE FROM marks
  WHERE id = ? AND user_id = ?
`);

const upsertPosition = db.prepare(`
  INSERT INTO positions (user_id, latitude, longitude, accuracy, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy = excluded.accuracy,
    updated_at = excluded.updated_at
`);

// Everyone but the asker: the reader's own dot comes from their own sensor,
// which is always fresher than the round trip through here.
const selectOtherPositions = db.prepare(`
  SELECT u.username, p.latitude, p.longitude, p.accuracy, p.updated_at AS time
  FROM positions p
  JOIN users u ON u.id = p.user_id
  WHERE p.user_id <> ? AND p.updated_at >= ?
  ORDER BY p.updated_at DESC
  LIMIT ?
`);

export function getUser(username) {
  return selectUserByName.get(username) ?? null;
}

export function createUser(username) {
  insertUser.run(username);
  return getUser(username);
}

export function countMarks(userId) {
  return countMarksForUser.get(userId)?.count ?? 0;
}

export function createMark(userId, { time, latitude, longitude, accuracy, label, place }) {
  const result = insertMark.run(
    userId,
    time,
    latitude,
    longitude,
    accuracy ?? null,
    label ?? null,
    place ?? null,
  );
  return selectMarkById.get(Number(result.lastInsertRowid), userId);
}

export function getMarks(userId, limit = 200) {
  return selectMarks.all(userId, limit);
}

export function renameMark(userId, markId, label) {
  if (updateMarkLabel.run(label, markId, userId).changes === 0) return null;
  return selectMarkById.get(markId, userId);
}

export function deleteMark(userId, markId) {
  return deleteMarkById.run(markId, userId).changes > 0;
}

export function savePosition(userId, { latitude, longitude, accuracy }) {
  upsertPosition.run(userId, latitude, longitude, accuracy ?? null, new Date().toISOString());
}

// `since` is an ISO timestamp: same format the column is written in, so the
// string comparison is a chronological one.
export function getOtherPositions(userId, since, limit = 200) {
  return selectOtherPositions.all(userId, since, limit);
}
