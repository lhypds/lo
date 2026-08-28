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
  -- that app anyway, and lo is in no position to check any of them. The website
  -- is the exception it can: it is stored with its scheme on the front, because
  -- what it is for is being pressed, and http or https is the whole of what lo
  -- will put in a link (see readProfile in index.js).
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    -- The second half of the credential, kept as it was typed. Deliberately not
    -- hashed: lo has no way to reset one — a reader who forgets theirs writes to
    -- the administrator (see VITE_ADMIN_EMAIL), who reads this column and sets a new
    -- one — and a hash would make that the one thing the administrator cannot
    -- do. It is never selected into a profile row (see PROFILE_COLUMNS): the
    -- only readings of it are the two statements below.
    -- Null on an account opened before there were passwords, which is what the
    -- login step reads as "this one is still to be chosen".
    password TEXT,
    -- A file name from data/images, the same as a post's photo and never bytes
    avatar TEXT,
    bio TEXT,
    email TEXT,
    website TEXT,
    line_id TEXT,
    whatsapp TEXT,
    wechat TEXT,
    -- Everywhere else somebody keeps an account, as a JSON array of
    -- {kind, value}. A column rather than a table of its own because it is a
    -- list with no identity and no questions asked of it: it is written whole
    -- every time the sheet saves, read whole with the row it belongs to, and its
    -- order is the reader's own — which is a document, and SQLite is being asked
    -- to keep it rather than to know anything about it. Parsed on the way out of
    -- this file, so nothing above ever sees the string.
    links TEXT,
    -- Whether this account is one of the dots on everybody else's map. On by
    -- default, because a location dashboard whose people card is empty until
    -- each reader has been into a sheet and found a switch is a card that looks
    -- broken rather than private.
    --
    -- It gates the reading and not the writing: a hidden account still files
    -- where it is, because it is still asking who else is about and that trade
    -- is one round trip (see PUT /api/position). What changes is that nobody
    -- else's answer has it in (see selectOtherPositions). Kept off the public
    -- profile on purpose — that somebody is hiding is not a thing to publish.
    discoverable INTEGER NOT NULL DEFAULT 1,
    -- The last way in: when the account last signed in and the address it came
    -- from. lo has no admin screen — the list of users is this table, read by
    -- hand by whoever also sets a forgotten password (see the note above) — and
    -- what that reading wants of an account is whether it is still being used
    -- and from where. Overwritten every sign-in rather than added to: this is
    -- the last one, not a history of them, and a history is a table.
    --
    -- Written wherever a session is handed out (see startSession), so a link key
    -- and a password count alike; presenting a token already held does not, or
    -- the column would be the clock rather than the account.
    --
    -- Never selected into a user or a profile row (see PROFILE_COLUMNS): where
    -- somebody signs in from is theirs, and the map is the only thing in lo that
    -- publishes anybody's whereabouts — with a switch on it (see discoverable).
    last_ip TEXT,
    last_login_at TEXT,
    -- And where the account last said it was. The same fix the positions table
    -- takes, kept a second time on the account so that the by-hand reading is
    -- one table rather than a join: positions is presence, read a hundred rows
    -- at a time to draw the map, and this is one line of an account's story
    -- beside its name. Held back from readers exactly as the address above is.
    last_latitude REAL,
    last_longitude REAL,
    last_position_at TEXT,
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

  -- Who is reading whom. The one thing in lo that is a relation between two
  -- accounts rather than between an account and the ground, and it points one
  -- way: following somebody is a thing you do, not a thing the two of you agree
  -- to, so there is nothing here to accept and nothing to be turned down.
  --
  -- The pair is the key, which is what makes following twice the same as
  -- following once — the INSERT below can be handed the same pair every time the
  -- button is pressed and the table stays the answer it was. No rowid: every row
  -- is its own two columns and a date, and nothing ever asks for one by number.
  --
  -- The CHECK is the one shape a row must not take. Following yourself would put
  -- a name in its own list and add one to both figures on its own page, and the
  -- endpoint refuses it too — this is the copy that holds whatever asks.
  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
  ) WITHOUT ROWID;

  -- The key above answers everything asked of a follower — who they follow, and
  -- whether they follow one particular account. This is the other direction,
  -- which the key cannot answer: who follows this account, newest first, which
  -- is the list the sheet on a profile page draws.
  CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows(followee_id, created_at DESC);

  -- A word from one account to one other. Unlike a post it is addressed, so it
  -- is filed under the pair rather than under the ground: nothing here knows or
  -- cares where either of them was standing.
  --
  -- Kept flat — a row per line said — rather than as threads with rows hanging
  -- off them: two accounts have exactly one conversation between them, so the
  -- pair of names *is* the thread, and a table of threads would be a second copy
  -- of that fact to keep in step with this one.
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    -- When the recipient opened the thread it is in, which is the only thing
    -- either side is told about a message after it is sent. Null means nobody
    -- has opened it yet, which is what puts the dot on the letter in the bar.
    read_at TEXT,
    -- When its sender took it back down. Soft rather than a real delete: the row
    -- stays so an exchange keeps its shape, and null is a line still standing.
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- One thread is every row with both accounts on it in either direction, so
  -- both directions are indexed; the second one is also what counts an inbox.
  CREATE INDEX IF NOT EXISTS messages_from_idx ON messages(from_user, id DESC);
  CREATE INDEX IF NOT EXISTS messages_to_idx ON messages(to_user, id DESC);

  -- What somebody coming past a post has to say back about it. A post is left on
  -- the ground for whoever finds it, and until now finding one was the end of
  -- the exchange — this is the other half, and it is filed under the post rather
  -- than under the spot, because what a comment is about is the words and not
  -- the ground they were left on.
  --
  -- No place and no fix of its own for the same reason: a comment is written
  -- wherever its writer happens to be, which is nobody's business but theirs,
  -- and a pin for it would be a second claim on ground the post already holds.
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- Oldest first, which is the order a conversation is read in and the opposite
  -- of every other list in lo: the rows below a post are an exchange, and an
  -- exchange read newest first is one read backwards. The same index answers the
  -- count on the preview.
  CREATE INDEX IF NOT EXISTS comments_post_idx ON comments(post_id, created_at);

  -- What lo has read of a story it put on the dashboard. The words themselves
  -- are not here: they are a document, read whole by the one reader who opened
  -- the row, and they live one JSON per article under data/articles (see
  -- articles.js). What is here is what a list needs — a headline, the first
  -- couple of sentences, when it was published — asked for twenty at a time and
  -- sorted, which is the shape SQLite is for.
  --
  -- The id is a digest of the address the *feed* gave — the opaque Google link
  -- the card is holding — rather than of the publisher's. That is the wrong way
  -- round for identity and the right way round for use: the card has the feed
  -- link and nothing else, so hashing it means a row can say "I have the reading
  -- for this one" without a lookup table or a resolve to find out. The cost is
  -- that a story carried by two feeds is kept twice, which is a few kilobytes.
  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    -- Which card it came off: news or events. Warnings keep no article — the
    -- bulletin behind them is a table lo already parses, not prose.
    kind TEXT NOT NULL,
    -- The address the feed gave, which is what the id above is a digest of.
    link TEXT NOT NULL,
    -- The publisher's own address, which the one above resolves to and which is
    -- the one a reader is offered when they want the page itself.
    url TEXT NOT NULL,
    title TEXT,
    source TEXT,
    preview TEXT,
    published_at TEXT,
    -- How much was actually got. Kept because it is the difference between a
    -- story and a paywall's opening paragraph, and the sheet says which it has.
    chars INTEGER NOT NULL DEFAULT 0,
    partial INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- Newest first within a card, which is the only way this table is ever read
  -- as a list; the primary key answers the other question, which is "do I
  -- already have this one".
  CREATE INDEX IF NOT EXISTS articles_kind_idx ON articles(kind, published_at DESC);
`);

// The account grew a profile after the first accounts were opened, so the
// columns are added to a table that already exists rather than only declared
// above. On a database made by the CREATE above every one of these is already
// there and the loop does nothing.
const userColumns = new Set(db.prepare(`PRAGMA table_info(users)`).all().map((column) => column.name));
for (const column of [
  "avatar",
  "bio",
  "email",
  "website",
  "line_id",
  "whatsapp",
  "wechat",
  "links",
  // Arrived last of all, and the accounts that predate it have it empty rather
  // than filled in with anything: the first sign-in that reaches one is where
  // its password is chosen.
  "password",
  // The password with the typing taken out of it: a key an account mints for
  // itself and carries in a link. It is kept on the account rather than with the
  // sessions because a session lives in a Map that a restart empties, and the
  // whole use of a link is being followed next week from a device that has never
  // signed in. Empty on every account until its owner asks for one.
  "link_key",
  // The last sign-in and the last fix, which arrived after every account already
  // had a history of both. Empty on all of them until the next one happens:
  // there is nowhere to read a past sign-in back from, and a made-up one would
  // be worse than a blank in the column that is meant to say "never seen".
  "last_ip",
  "last_login_at",
  "last_position_at",
]) {
  if (!userColumns.has(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
}

// The two halves of that fix, which are numbers rather than text and so are
// added apart from the loop, the same way discoverable is below.
for (const column of ["last_latitude", "last_longitude"]) {
  if (!userColumns.has(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} REAL`);
}

// Being findable arrived after the first accounts were opened, and it is the one
// added column that is not TEXT — so it is added here rather than in the loop
// above. The default is what every account that predates the switch gets, which
// is the answer they have been giving all along.
if (!userColumns.has("discoverable")) {
  db.exec(`ALTER TABLE users ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 1`);
}

// Soft delete arrived after the first messages were sent, so the column is added
// to a table that may already exist. On a database made by the CREATE above it
// is already there and this does nothing.
const messageColumns = new Set(db.prepare(`PRAGMA table_info(messages)`).all().map((column) => column.name));
if (!messageColumns.has("deleted_at")) db.exec(`ALTER TABLE messages ADD COLUMN deleted_at TEXT`);

// What a person is, as far as anyone else is concerned: the name, when they
// turned up, the line they wrote about themselves and the ways to reach them.
// A contact is filled in to be read by whoever comes past a post, so it is part
// of the public answer rather than something held back for its owner.
const PROFILE_COLUMNS = `
  u.username,
  u.created_at AS createdAt,
  -- The URL rather than the name it is stored under, the same way a post hands
  -- over its photo: every reader of this wants the address, and the one place
  -- that needs the name back is the sheet that writes it (see profileFields).
  CASE WHEN u.avatar IS NULL THEN NULL ELSE '/api/images/' || u.avatar END AS avatar,
  u.links,
  u.bio,
  u.email,
  u.website,
  u.line_id AS line,
  u.whatsapp,
  u.wechat
`;

// The signed-in reader's own row, which is the public profile plus the two
// things only they are told: their id, and whether they are on everybody else's
// map. Deliberately not in PROFILE_COLUMNS — see the note on the column.
const selectUserByName = db.prepare(`
  SELECT u.id, u.discoverable, ${PROFILE_COLUMNS}
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
  SET avatar = ?, links = ?, bio = ?, email = ?, website = ?, line_id = ?, whatsapp = ?, wechat = ?
  WHERE id = ?
`);

const insertUser = db.prepare(`
  INSERT INTO users (username, password)
  VALUES (?, ?)
`);

// The one column no reader of a user ever gets handed. Everything else about an
// account travels as a row — the profile columns above go out to whoever asks
// for the page — so the password is read on its own, by the one statement that
// has any business with it, and compared inside the login endpoint.
const selectPasswordByName = db.prepare(`
  SELECT password
  FROM users
  WHERE username = ?
`);

// Chosen once, by the first sign-in to reach an account that has none: either an
// account just opened, or one from before there were passwords.
const updatePassword = db.prepare(`
  UPDATE users
  SET password = ?
  WHERE id = ?
`);

// The other column that never travels as part of a user, and read on its own for
// the same reason the password is. Looked up by the key rather than by the name,
// because that is the whole of what whoever follows the link has to offer — the
// key names the account as well as proving it.
const selectUserByLinkKey = db.prepare(`
  SELECT u.id, ${PROFILE_COLUMNS}
  FROM users u
  WHERE u.link_key = ?
`);

const selectLinkKeyById = db.prepare(`
  SELECT link_key AS linkKey
  FROM users
  WHERE id = ?
`);

// Minted, replaced and withdrawn by the one statement: an account holds one key
// at a time, so asking for a link retires the link before it and a null is an
// account with none.
const updateLinkKey = db.prepare(`
  UPDATE users
  SET link_key = ?
  WHERE id = ?
`);

// Stamping the account with the sign-in that has just happened. Write-only as
// far as lo is concerned: nothing above reads either column back, and the one
// reader they have is a person with the table open (see the note on them).
const updateLastLogin = db.prepare(`
  UPDATE users
  SET last_ip = ?, last_login_at = ?
  WHERE id = ?
`);

const countMarksForUser = db.prepare(`
  SELECT COUNT(*) AS count
  FROM marks
  WHERE user_id = ?
`);

// The other half of what an account has left behind. Two statements rather than
// one with a join, because they count two unrelated tables and the account sheet
// draws them as two figures — a mark is private and a post is not, which is the
// whole difference between them and is worth reading as two lines.
const countPostsForUser = db.prepare(`
  SELECT COUNT(*) AS count
  FROM posts
  WHERE user_id = ?
`);

// Whether this account is on everybody else's map. Written as 1 and 0 because
// SQLite has no boolean; turned back into one on the way out of this file, so
// nothing above ever compares a number (see getUser).
const updateDiscoverable = db.prepare(`
  UPDATE users
  SET discoverable = ?
  WHERE id = ?
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
  u.username,
  -- How many people have said something back. Part of every reading of a post
  -- rather than a request of its own: the figure is drawn in the corner of the
  -- bubble on the map, which is already holding the post, and a count fetched
  -- separately would land after the thing it is counting for.
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments
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

/* ------------------------------------------------------------------ follows */

// Following twice is following once: the pair is the table's key, so a second
// press of a button that never came back — or a second tab pressing the same
// one — lands on the row that is already there rather than on an error.
const insertFollow = db.prepare(`
  INSERT OR IGNORE INTO follows (follower_id, followee_id)
  VALUES (?, ?)
`);

const deleteFollow = db.prepare(`
  DELETE FROM follows
  WHERE follower_id = ? AND followee_id = ?
`);

// The three things a profile page has to say about following, in one reading of
// it: how many read this account, how many it reads, and whether the reader
// standing in front of it is one of the first. They are one answer because they
// are drawn as one row — two figures and the button beside them — and asking in
// three round trips would let the row disagree with itself.
//
// By name rather than by id, so this is the same question the page asks: the
// account being read is a name in a path, and its id is nobody's business above
// this file.
const selectFollowStats = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM follows WHERE followee_id = u.id) AS followers,
    (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following,
    EXISTS (SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = u.id) AS isFollowing
  FROM users u
  WHERE u.username = ?
`);

// A row of either list is a person, and a person in lo is a name and, where
// they have put one up, a picture. The rest of who they are is on their page,
// which the row is a way through to — a list of everyone who follows somebody
// is not the place to read anybody's bio.
const FOLLOW_COLUMNS = `
  u.username,
  CASE WHEN u.avatar IS NULL THEN NULL ELSE '/api/images/' || u.avatar END AS avatar,
  f.created_at AS time
`;

// Newest first, which is the order these are read in: the list answers "who has
// been turning up" as much as "who is here", and the name added this morning is
// the one worth seeing without scrolling.
const selectFollowers = db.prepare(`
  SELECT ${FOLLOW_COLUMNS}
  FROM follows f
  JOIN users u ON u.id = f.follower_id
  WHERE f.followee_id = ?
  ORDER BY f.created_at DESC, u.id DESC
  LIMIT ?
`);

const selectFollowing = db.prepare(`
  SELECT ${FOLLOW_COLUMNS}
  FROM follows f
  JOIN users u ON u.id = f.followee_id
  WHERE f.follower_id = ?
  ORDER BY f.created_at DESC, u.id DESC
  LIMIT ?
`);

/* ----------------------------------------------------------------- comments */

const insertComment = db.prepare(`
  INSERT INTO comments (post_id, user_id, body)
  VALUES (?, ?, ?)
`);

// A comment is what was said, who said it, and when — the same three things a
// row of any list of people in lo carries, plus the words. The picture comes
// along because the sheet draws a column of faces and names, and asking for each
// writer's profile afterwards would be one request per row.
const COMMENT_COLUMNS = `
  c.id,
  c.body,
  c.created_at AS time,
  u.username,
  CASE WHEN u.avatar IS NULL THEN NULL ELSE '/api/images/' || u.avatar END AS avatar
`;

const selectCommentById = db.prepare(`
  SELECT ${COMMENT_COLUMNS}
  FROM comments c
  JOIN users u ON u.id = c.user_id
  WHERE c.id = ?
`);

// Oldest first: this is an exchange, and an exchange is read from the top. Every
// other list in lo runs the other way because every other list answers "what has
// been happening", where this one answers "what was said".
const selectComments = db.prepare(`
  SELECT ${COMMENT_COLUMNS}
  FROM comments c
  JOIN users u ON u.id = c.user_id
  WHERE c.post_id = ?
  ORDER BY c.created_at ASC, c.id ASC
  LIMIT ?
`);

const countCommentsOnPost = db.prepare(`
  SELECT COUNT(*) AS count
  FROM comments
  WHERE post_id = ?
`);

/* ----------------------------------------------------------------- messages */

const insertMessage = db.prepare(`
  INSERT INTO messages (from_user, to_user, body)
  VALUES (?, ?, ?)
`);

// `mine` is the one thing a line in a conversation needs that is not in its own
// row: which side of the sheet it hangs on. Worked out here rather than by
// handing anybody's id out — nothing above this file knows one — and a
// conversation is drawn from the point of view of whoever asked for it.
//
// `read` is the other end of the stamp the inbox counts with: the row already
// knows when the person it was addressed to first had the thread open in front of
// them, and that is the one thing the sender cannot see for themselves. Sent out
// as a yes or no rather than as the hour, because what a sender is owed is that it
// arrived in front of somebody, not a record of when they looked.
const selectMessageById = db.prepare(`
  SELECT m.id, m.body, m.created_at AS time, m.from_user = ? AS mine,
    m.read_at IS NOT NULL AS read
  FROM messages m
  WHERE m.id = ?
`);

// A thread is every row with both accounts on it, whichever way round — the two
// halves of a conversation are one conversation. Newest first and reversed by
// the caller, so a long thread hands back its end rather than its beginning.
//
// By id rather than by the clock: ids are handed out in order, so this is the
// true sequence of an exchange without either side's timestamp being trusted.
const selectConversation = db.prepare(`
  SELECT m.id, m.body, m.created_at AS time, m.from_user = ? AS mine,
    m.read_at IS NOT NULL AS read
  FROM messages m
  WHERE ((m.from_user = ? AND m.to_user = ?) OR (m.from_user = ? AND m.to_user = ?))
    AND m.deleted_at IS NULL
  ORDER BY m.id DESC
  LIMIT ?
`);

// Everyone this account has traded a word with, one row each: who they are, the
// last thing either of them said, and how much of it is still unread.
//
// A conversation and not a mailbox. Which direction a message went is a fact
// about that message, not a place it lives — filing them under "in" and "out"
// cuts one conversation in half and puts the halves in different boxes. So the
// list is of people, and a person opens the thread.
//
// `other` is the account at the far end of a row whichever end this one is at,
// which is what turns a table of messages into a list of people. The last word
// in each thread is the row with the highest id under that name.
const selectThreads = db.prepare(`
  WITH conv AS (
    SELECT
      CASE WHEN m.from_user = ? THEN m.to_user ELSE m.from_user END AS other,
      m.id,
      m.body,
      m.created_at,
      m.from_user
    FROM messages m
    WHERE (m.from_user = ? OR m.to_user = ?)
      AND m.deleted_at IS NULL
  )
  SELECT
    u.username,
    CASE WHEN u.avatar IS NULL THEN NULL ELSE '/api/images/' || u.avatar END AS avatar,
    c.body,
    c.created_at AS time,
    CASE WHEN c.from_user = ? THEN 1 ELSE 0 END AS mine,
    (
      SELECT COUNT(*)
      FROM messages unread
      WHERE unread.to_user = ? AND unread.from_user = u.id AND unread.read_at IS NULL
        AND unread.deleted_at IS NULL
    ) AS unread
  FROM conv c
  JOIN users u ON u.id = c.other
  WHERE c.id = (SELECT MAX(latest.id) FROM conv latest WHERE latest.other = c.other)
  ORDER BY c.id DESC
  LIMIT ?
`);

// The figure behind the dot on the letter in the top bar, and the whole of what
// that dot knows: how many lines are sitting in the inbox unopened. Counted
// across everybody rather than per conversation — the bar has one letter on it,
// and what it is saying is "somebody wrote".
const countUnreadMessages = db.prepare(`
  SELECT COUNT(*) AS count
  FROM messages
  WHERE to_user = ? AND read_at IS NULL AND deleted_at IS NULL
`);

// Opening a thread reads it: everything in it addressed to the reader and not
// already stamped, in one statement. Only the other side's lines are touched —
// your own were never unread — and only the ones still unmarked, so the stamp is
// when a line was first opened rather than when it was last looked at.
const markConversationRead = db.prepare(`
  UPDATE messages
  SET read_at = ?
  WHERE to_user = ? AND from_user = ? AND read_at IS NULL
`);

// A whole exchange taken down from the inbox, both directions at once: the list
// is of conversations, so what a row's delete removes is the conversation. Soft
// — every line is stamped rather than removed — and only the ones still standing,
// so the count of what changed is the count of what this press took down.
const deleteConversationMessages = db.prepare(`
  UPDATE messages
  SET deleted_at = ?
  WHERE ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))
    AND deleted_at IS NULL
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

// And the same fix written onto the account, which is where it can be read
// without joining anything: one line of an account's story rather than a row of
// the map. Its own timestamp rather than the one in positions, so that a column
// beside the coordinates says how old they are.
const updateLastPosition = db.prepare(`
  UPDATE users
  SET last_latitude = ?, last_longitude = ?, last_position_at = ?
  WHERE id = ?
`);

// Everyone but the asker: the reader's own dot comes from their own sensor,
// which is always fresher than the round trip through here.
const selectOtherPositions = db.prepare(`
  SELECT u.username, p.latitude, p.longitude, p.accuracy, p.updated_at AS time
  FROM positions p
  JOIN users u ON u.id = p.user_id
  WHERE p.user_id <> ? AND p.updated_at >= ? AND u.discoverable = 1
  ORDER BY p.updated_at DESC
  LIMIT ?
`);

// The one thing in a profile row that is not already the shape its reader wants:
// the links are a JSON array on the way in and out of the column, and text
// nowhere else in lo. Anything unreadable in there is read as no links at all —
// a profile is still a profile without them, and there is nobody to tell.
function withLinks(row) {
  if (!row) return null;
  let links = [];
  try {
    const parsed = JSON.parse(row.links ?? "[]");
    if (Array.isArray(parsed)) links = parsed;
  } catch {
    // Left empty
  }
  return { ...row, links };
}

// The signed-in reader's own row. SQLite answers the switch in 1 and 0, and
// every reader of it above wants a yes or a no — the same turn withSide takes on
// a message, and for the same reason.
export function getUser(username) {
  const row = withLinks(selectUserByName.get(username) ?? null);
  return row ? { ...row, discoverable: row.discoverable === 1 } : null;
}

export function getProfile(username) {
  return withLinks(selectProfileByName.get(username) ?? null);
}

// An empty field is stored as nothing rather than as an empty string, so "not
// filled in" is one value in the column and not two.
export function updateProfile(userId, profile) {
  const kept = (value) => {
    const text = String(value ?? "").trim();
    return text || null;
  };
  updateProfileFields.run(
    kept(profile.avatar),
    // Stored as nothing when there are none, for the same reason every other
    // empty field is: "[]" and NULL would be two ways of saying the same thing.
    profile.links?.length ? JSON.stringify(profile.links) : null,
    kept(profile.bio),
    kept(profile.email),
    kept(profile.website),
    kept(profile.line),
    kept(profile.whatsapp),
    kept(profile.wechat),
    userId,
  );
}

export function createUser(username, password) {
  insertUser.run(username, password);
  return getUser(username);
}

// Nothing back where there is no such account, and null where there is one with
// no password chosen yet — two different answers, and the login step tells them
// apart before it asks for anything.
export function getPassword(username) {
  const row = selectPasswordByName.get(username);
  if (!row) return undefined;
  return row.password ?? null;
}

export function setPassword(userId, password) {
  updatePassword.run(password, userId);
}

// Whose key this is, or nobody's. The empty key is refused before the statement
// rather than handed to it: an account that has never minted one holds SQL's
// null and would match nothing anyway, but a link with no key after the # is a
// question not worth asking the database at all.
export function getUserByLinkKey(key) {
  if (!key) return null;
  return selectUserByLinkKey.get(key) ?? null;
}

// What the account's own sheet shows, and the one reader of this column that is
// not signing somebody in.
export function getLinkKey(userId) {
  return selectLinkKeyById.get(userId)?.linkKey ?? null;
}

export function setLinkKey(userId, key) {
  updateLinkKey.run(key, userId);
}

// Where a sign-in came from, and when. An address lo could not make out is
// stored as nothing rather than as a blank, so "not known" is one value in the
// column and not two — the rule every other optional field here follows.
export function recordLogin(userId, ip) {
  updateLastLogin.run(ip || null, new Date().toISOString(), userId);
}

export function countMarks(userId) {
  return countMarksForUser.get(userId)?.count ?? 0;
}

export function countPosts(userId) {
  return countPostsForUser.get(userId)?.count ?? 0;
}

export function setDiscoverable(userId, on) {
  updateDiscoverable.run(on ? 1 : 0, userId);
  return on;
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

// One post, whoever left it: the two comment endpoints below start by asking
// whether there is anything here to be talking about, and a post that is not
// there is not one anybody may write under.
export function getPost(postId) {
  return selectPostById.get(postId) ?? null;
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

// Both presses answer with the state they left behind rather than with whether
// they changed anything: what the button in front of the reader needs to know is
// which word it should be showing now, and that is the same answer whether the
// press did the work or found it already done.
export function followUser(followerId, followeeId) {
  insertFollow.run(followerId, followeeId);
}

export function unfollowUser(followerId, followeeId) {
  deleteFollow.run(followerId, followeeId);
}

// EXISTS answers in SQLite's 0 and 1, and everything above this file reads it as
// a yes or a no — the same turn the links column gets on its way out.
export function getFollowStats(viewerId, username) {
  const row = selectFollowStats.get(viewerId, username);
  if (!row) return null;
  return { followers: row.followers, following: row.following, isFollowing: row.isFollowing === 1 };
}

export function getFollowers(userId, limit = 200) {
  return selectFollowers.all(userId, limit);
}

export function getFollowing(userId, limit = 200) {
  return selectFollowing.all(userId, limit);
}

export function getComments(postId, limit = 200) {
  return selectComments.all(postId, limit);
}

// The comment that was just written, and the figure it has just changed: the
// sheet puts the one at the bottom of its list and hands the other back to the
// map, where the count in the corner of a bubble is what said there was
// anything to open. Two answers because they belong to two different things on
// screen, and one round trip because they are the same act.
export function createComment(userId, postId, body) {
  const result = insertComment.run(postId, userId, body);
  return {
    comment: selectCommentById.get(Number(result.lastInsertRowid)),
    count: countCommentsOnPost.get(postId)?.count ?? 0,
  };
}

// SQLite answers a comparison in 0 and 1; every reader of a message wants a yes
// or a no, which is the same turn EXISTS gets in getFollowStats above.
function withSide(row) {
  return row ? { ...row, mine: row.mine === 1 } : null;
}

// A line of a conversation carries one more of those: whether it has been in front
// of the person it was addressed to. Only your own lines have anything to say with
// it — a line addressed to you is read by the act of reading it — which is why the
// sheet draws the mark on your side only (see MessageModal).
function withRead(row) {
  const line = withSide(row);
  return line ? { ...line, read: row.read === 1 } : null;
}

export function getThreads(userId, limit = 100) {
  return selectThreads.all(userId, userId, userId, userId, userId, limit).map(withSide);
}

// Oldest last out of SQLite and oldest first on the way out of here: a thread is
// read downwards, so the newest is the row nearest the composer.
export function getConversation(userId, otherUserId, limit = 200) {
  return selectConversation
    .all(userId, userId, otherUserId, otherUserId, userId, limit)
    .reverse()
    .map(withRead);
}

export function countUnread(userId) {
  return countUnreadMessages.get(userId)?.count ?? 0;
}

export function readConversation(userId, otherUserId) {
  return markConversationRead.run(new Date().toISOString(), userId, otherUserId).changes;
}

export function createMessage(fromUserId, toUserId, body) {
  const result = insertMessage.run(fromUserId, toUserId, body);
  return withRead(selectMessageById.get(fromUserId, Number(result.lastInsertRowid)));
}

export function deleteConversation(userId, otherUserId) {
  return deleteConversationMessages.run(new Date().toISOString(), userId, otherUserId, otherUserId, userId).changes;
}

// One fix, filed twice: in positions, which is the presence the map is drawn
// from, and on the account, which is the copy a person reading the users table
// has in front of them. The same stamp on both, so the two never disagree about
// when it was taken.
export function savePosition(userId, { latitude, longitude, accuracy }) {
  const now = new Date().toISOString();
  upsertPosition.run(userId, latitude, longitude, accuracy ?? null, now);
  updateLastPosition.run(latitude, longitude, now, userId);
}

// `since` is an ISO timestamp: same format the column is written in, so the
// string comparison is a chronological one.
export function getOtherPositions(userId, since, limit = 200) {
  return selectOtherPositions.all(userId, since, limit);
}


/* ---------------------------------------------------------------- articles -- */

// Written once per story ever, so the conflict clause is not a race so much as
// the second card asking for a story the first one already read — the newer
// reading wins, because a page fetched again is a page that may have grown its
// second half since (a paywall lifted, a wire story filled in).
const upsertArticle = db.prepare(`
  INSERT INTO articles (id, kind, link, url, title, source, preview, published_at, chars, partial, fetched_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    kind = excluded.kind,
    url = excluded.url,
    title = excluded.title,
    source = excluded.source,
    preview = excluded.preview,
    published_at = excluded.published_at,
    chars = excluded.chars,
    partial = excluded.partial,
    fetched_at = excluded.fetched_at
`);

const selectArticle = db.prepare(`SELECT * FROM articles WHERE id = ?`);

export function rememberArticle(article) {
  upsertArticle.run(
    article.id,
    article.kind,
    article.link,
    article.url,
    article.title ?? null,
    article.source ?? null,
    article.preview ?? null,
    article.published_at ?? null,
    article.chars ?? 0,
    article.partial ?? 0,
    new Date().toISOString(),
  );
  return selectArticle.get(article.id);
}

// The row only — the words are a file, and nothing here reads them.
export function findArticle(id) {
  return selectArticle.get(id) ?? null;
}
