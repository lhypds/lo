import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(__dirname, "..", "db.sqlite");

export const db = new DatabaseSync(databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- The username is the whole account, and everything after it is optional: a
  -- line about yourself and the ways you can be reached off lo. A contact is
  -- kept as the bare handle its own app asks for — an address, a LINE ID, a
  -- number, a WeChat ID — because that is what a reader would have to type into
  -- that app anyway, and lo is in no position to check any of them.
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    bio TEXT,
    email TEXT,
    line_id TEXT,
    whatsapp TEXT,
    wechat TEXT,
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

  -- A mark is private and says only "I was here"; a post is public and says
  -- something about the spot, so it carries words, maybe a photo, and the name
  -- of whoever left it. The photo is a file name from data/images, never bytes:
  -- the row stays small enough to hand out by the hundred.
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    time TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    body TEXT NOT NULL DEFAULT '',
    image TEXT,
    image_width INTEGER,
    image_height INTEGER,
    place TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS posts_time_idx ON posts(time DESC);
  CREATE INDEX IF NOT EXISTS posts_latitude_idx ON posts(latitude);
  -- Posts are asked for by ground almost everywhere, and by author on one page:
  -- a profile, which reads what somebody has been leaving about. Same shape as
  -- the marks index, since it answers the same question about one account.
  CREATE INDEX IF NOT EXISTS posts_user_time_idx ON posts(user_id, time DESC);

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

// The account grew a profile after the first accounts were opened, so the
// columns are added to a table that already exists rather than only declared
// above. On a database made by the CREATE above every one of these is already
// there and the loop does nothing.
const userColumns = new Set(db.prepare(`PRAGMA table_info(users)`).all().map((column) => column.name));
for (const column of ["bio", "email", "line_id", "whatsapp", "wechat"]) {
  if (!userColumns.has(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
}

// What a person is, as far as anyone else is concerned: the name, when they
// turned up, the line they wrote about themselves and the ways to reach them.
// A contact is filled in to be read by whoever comes past a post, so it is part
// of the public answer rather than something held back for its owner.
const PROFILE_COLUMNS = `
  u.username,
  u.created_at AS createdAt,
  u.bio,
  u.email,
  u.line_id AS line,
  u.whatsapp,
  u.wechat
`;

const selectUserByName = db.prepare(`
  SELECT u.id, ${PROFILE_COLUMNS}
  FROM users u
  WHERE u.username = ?
`);

const selectProfileByName = db.prepare(`
  SELECT ${PROFILE_COLUMNS}
  FROM users u
  WHERE u.username = ?
`);

// Every field at once, and every one of them clearable: the sheet that sends
// this holds the whole profile, so what it does not send is what the reader
// deleted rather than what they left alone.
const updateProfileFields = db.prepare(`
  UPDATE users
  SET bio = ?, email = ?, line_id = ?, whatsapp = ?, wechat = ?
  WHERE id = ?
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

/* --------------------------------------------------------------------- posts */

const insertPost = db.prepare(`
  INSERT INTO posts (user_id, time, latitude, longitude, accuracy, body, image, image_width, image_height, place)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// The stored image is a bare file name; every reader wants the URL, so the
// column is turned into one here rather than in each caller.
const POST_COLUMNS = `
  p.id,
  p.time,
  p.latitude,
  p.longitude,
  p.accuracy,
  p.body,
  CASE WHEN p.image IS NULL THEN NULL ELSE '/api/images/' || p.image END AS image,
  p.image_width AS imageWidth,
  p.image_height AS imageHeight,
  p.place,
  u.username
`;

const selectPostById = db.prepare(`
  SELECT ${POST_COLUMNS}
  FROM posts p
  JOIN users u ON u.id = p.user_id
  WHERE p.id = ?
`);

const selectPostsInBox = db.prepare(`
  SELECT ${POST_COLUMNS}
  FROM posts p
  JOIN users u ON u.id = p.user_id
  WHERE p.latitude BETWEEN ? AND ? AND p.longitude BETWEEN ? AND ?
  ORDER BY p.time DESC, p.id DESC
  LIMIT ?
`);

// The same query for a box that runs off the edge of the world: east of the
// west edge *or* west of the east edge, because near the antimeridian those two
// numbers are the wrong way round.
const selectPostsInWrappedBox = db.prepare(`
  SELECT ${POST_COLUMNS}
  FROM posts p
  JOIN users u ON u.id = p.user_id
  WHERE p.latitude BETWEEN ? AND ? AND (p.longitude >= ? OR p.longitude <= ?)
  ORDER BY p.time DESC, p.id DESC
  LIMIT ?
`);

const selectRecentPosts = db.prepare(`
  SELECT ${POST_COLUMNS}
  FROM posts p
  JOIN users u ON u.id = p.user_id
  ORDER BY p.time DESC, p.id DESC
  LIMIT ?
`);

// One person's, newest first and without a box around them: this is the answer
// to "who is this", not to "what is around here", so where they were standing is
// the row's own business rather than the question being asked.
const selectPostsByUser = db.prepare(`
  SELECT ${POST_COLUMNS}
  FROM posts p
  JOIN users u ON u.id = p.user_id
  WHERE u.username = ?
  ORDER BY p.time DESC, p.id DESC
  LIMIT ?
`);

// The words and the photo, and nothing else: a post is filed under the spot and
// the moment it was left at, and letting an edit move either of those would make
// a pin on the map a claim about somewhere its author was never standing.
const updatePostContent = db.prepare(`
  UPDATE posts
  SET body = ?, image = ?, image_width = ?, image_height = ?
  WHERE id = ? AND user_id = ?
`);

const deletePostById = db.prepare(`
  DELETE FROM posts
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

export function getProfile(username) {
  return selectProfileByName.get(username) ?? null;
}

// An empty field is stored as nothing rather than as an empty string, so "not
// filled in" is one value in the column and not two.
export function updateProfile(userId, profile) {
  const kept = (value) => {
    const text = String(value ?? "").trim();
    return text || null;
  };
  updateProfileFields.run(
    kept(profile.bio),
    kept(profile.email),
    kept(profile.line),
    kept(profile.whatsapp),
    kept(profile.wechat),
    userId,
  );
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

export function createPost(userId, post) {
  const result = insertPost.run(
    userId,
    post.time,
    post.latitude,
    post.longitude,
    post.accuracy ?? null,
    post.body ?? "",
    post.image ?? null,
    post.imageWidth ?? null,
    post.imageHeight ?? null,
    post.place ?? null,
  );
  return selectPostById.get(Number(result.lastInsertRowid));
}

// Posts are everyone's, so they are asked for by ground rather than by author:
// what is on the map in front of the reader, not what is on the map in Lisbon.
// The box is a degree conversion of `radiusMeters` — a square around a circle,
// which lets SQLite answer from the latitude index instead of measuring every
// row, and costs only a few posts just outside the corner.
export function getPostsNear({ latitude, longitude }, radiusMeters, limit = 200) {
  const latSpan = radiusMeters / 110574;
  // Longitude degrees shrink towards the poles; at 89° the box would be wider
  // than the world, which is the same as no longitude filter at all.
  const lonSpan = radiusMeters / Math.max(111320 * Math.cos((latitude * Math.PI) / 180), 1);
  const minLat = Math.max(-90, latitude - latSpan);
  const maxLat = Math.min(90, latitude + latSpan);
  if (lonSpan >= 180) return selectPostsInBox.all(minLat, maxLat, -180, 180, limit);

  const minLon = longitude - lonSpan;
  const maxLon = longitude + lonSpan;
  if (minLon >= -180 && maxLon <= 180) {
    return selectPostsInBox.all(minLat, maxLat, minLon, maxLon, limit);
  }
  return selectPostsInWrappedBox.all(
    minLat,
    maxLat,
    minLon < -180 ? minLon + 360 : minLon,
    maxLon > 180 ? maxLon - 360 : maxLon,
    limit,
  );
}

export function getRecentPosts(limit = 200) {
  return selectRecentPosts.all(limit);
}

export function getPostsByUser(username, limit = 20) {
  return selectPostsByUser.all(username, limit);
}

// Nothing back rather than a row when the id is somebody else's or nobody's,
// which is how renameMark answers the same question.
export function updatePost(userId, postId, post) {
  const changed = updatePostContent.run(
    post.body ?? "",
    post.image ?? null,
    post.imageWidth ?? null,
    post.imageHeight ?? null,
    postId,
    userId,
  ).changes;
  if (changed === 0) return null;
  return selectPostById.get(postId);
}

export function deletePost(userId, postId) {
  return deletePostById.run(postId, userId).changes > 0;
}

export function savePosition(userId, { latitude, longitude, accuracy }) {
  upsertPosition.run(userId, latitude, longitude, accuracy ?? null, new Date().toISOString());
}

// `since` is an ISO timestamp: same format the column is written in, so the
// string comparison is a chronological one.
export function getOtherPositions(userId, since, limit = 200) {
  return selectOtherPositions.all(userId, since, limit);
}

