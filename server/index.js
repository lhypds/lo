import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  countMarks,
  createMark,
  createPost,
  createUser,
  deleteMark,
  deletePost,
  getMarks,
  getOtherPositions,
  getPostsNear,
  getRecentPosts,
  getUser,
  renameMark,
  savePosition,
} from "./db.js";
import { COMPONENTS, componentsFor, countryList } from "./countries.js";
import {
  lookupEvents,
  lookupNearby,
  lookupPlace,
  lookupTrends,
  lookupWarnings,
  lookupWeather,
} from "./geo.js";
import { MAX_IMAGE_BYTES, imageFile, isStoredName, storeImage } from "./images.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

try {
  // real environment variables take precedence over .env entries
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env file — use the ambient environment as-is
}

const port = Number(process.env.PORT) || 3014;
const isProduction = process.env.NODE_ENV === "production";

const USERNAME_RE =
  /^[a-z0-9_\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}-]{1,32}$/u;
const USERNAME_HINT = "用户名为 1–32 个字符，可使用中日韩文字、字母、数字、- 和 _";
const sessions = new Map();
const sessionAgeMs = 30 * 24 * 60 * 60 * 1000;
const sessionCookie = "lo_session";

const LANGS = new Set(["en", "zh", "ja"]);

function normalizeUsername(value) {
  return String(value ?? "").trim().normalize("NFKC").toLowerCase();
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

function cookieValue(req, name) {
  const prefix = `${name}=`;
  const part = String(req.headers.cookie ?? "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  if (!part) return null;
  try {
    return decodeURIComponent(part.slice(prefix.length));
  } catch {
    return null;
  }
}

function currentSession(req) {
  const token = cookieValue(req, sessionCookie);
  const session = token ? sessions.get(token) : null;
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function startSession(user, req, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { userId: user.id, username: user.username, expiresAt: Date.now() + sessionAgeMs });
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: sessionAgeMs,
    path: "/",
  });
}

function clearSession(req, res) {
  const session = currentSession(req);
  if (session) sessions.delete(session.token);
  res.clearCookie(sessionCookie, { httpOnly: true, sameSite: "lax", secure: req.secure, path: "/" });
}

function requireSession(req, res, next) {
  const session = currentSession(req);
  if (!session) return res.status(401).json({ error: "请先登录", code: "LOGIN_REQUIRED" });
  const user = getUser(session.username);
  if (!user) {
    clearSession(req, res);
    return res.status(401).json({ error: "请重新登录", code: "LOGIN_REQUIRED" });
  }
  req.user = user;
  next();
}

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "32kb" }));

app.get("/api/session", (req, res) => {
  const session = currentSession(req);
  const user = session ? getUser(session.username) : null;
  if (!user) return res.status(401).json({ error: "未登录", code: "LOGIN_REQUIRED" });
  res.json({ user });
});

// A username is the whole account, but a name nobody has used yet is more often
// a typo than a new person — so login only signs in, and an unknown name comes
// back as USER_NOT_FOUND for the browser to ask about before /api/users opens it.
app.post("/api/login", (req, res) => {
  const username = normalizeUsername(req.body?.username);
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: USERNAME_HINT });
  }
  const user = getUser(username);
  if (!user) return res.status(404).json({ error: "用户不存在", code: "USER_NOT_FOUND" });
  startSession(user, req, res);
  res.json({ user });
});

app.post("/api/logout", (req, res) => {
  clearSession(req, res);
  res.status(204).end();
});

// Opening the account and signing into it are the same request: there is no
// password to set, so a confirmed name is all it takes.
app.post("/api/users", (req, res) => {
  const username = normalizeUsername(req.body?.username);
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: USERNAME_HINT });
  }
  if (getUser(username)) return res.status(409).json({ error: "用户名已存在", code: "USER_EXISTS" });

  try {
    const user = createUser(username);
    startSession(user, req, res);
    res.status(201).json({ user });
  } catch (error) {
    console.error("create user failed", error);
    res.status(500).json({ error: "创建用户失败" });
  }
});

app.get("/api/me", requireSession, (req, res) => {
  res.json({ user: req.user, markCount: countMarks(req.user.id) });
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
  if (!coords) return res.status(400).json({ error: "坐标无效" });
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
  if (!coords) return res.status(400).json({ error: "坐标无效" });
  try {
    res.json(await lookupNearby(coords.latitude, coords.longitude, requestedLang(req)));
  } catch (error) {
    if (error.name === "TimeoutError") return res.status(504).json({ error: "获取周围事件超时" });
    next(error);
  }
});

app.get("/api/events", async (req, res, next) => {
  const coords = parseCoords(req.query);
  if (!coords) return res.status(400).json({ error: "坐标无效" });
  try {
    res.json(await lookupEvents(coords.latitude, coords.longitude, requestedLang(req)));
  } catch (error) {
    if (error.name === "TimeoutError") return res.status(504).json({ error: "获取活动信息超时" });
    next(error);
  }
});

app.get("/api/trends", async (req, res, next) => {
  const coords = parseCoords(req.query);
  if (!coords) return res.status(400).json({ error: "坐标无效" });
  try {
    res.json(await lookupTrends(coords.latitude, coords.longitude, requestedLang(req)));
  } catch (error) {
    if (error.name === "TimeoutError") return res.status(504).json({ error: "获取趋势超时" });
    next(error);
  }
});

// No lang: the warnings come off a Japanese page in Japanese, and the card puts
// the reader's own words back on what it can name.
app.get("/api/warnings", async (req, res, next) => {
  const coords = parseCoords(req.query);
  if (!coords) return res.status(400).json({ error: "坐标无效" });
  try {
    res.json(await lookupWarnings(coords.latitude, coords.longitude));
  } catch (error) {
    if (error.name === "TimeoutError") return res.status(504).json({ error: "获取警报信息超时" });
    next(error);
  }
});

/* ------------------------------------------------------------------- marks */

app.get("/api/marks", requireSession, (req, res) => {
  const parsedLimit = Number(req.query.limit);
  const limit = Number.isInteger(parsedLimit) ? Math.min(500, Math.max(1, parsedLimit)) : 200;
  res.json({ marks: getMarks(req.user.id, limit) });
});

app.post("/api/marks", requireSession, async (req, res, next) => {
  const location = parseLocation(req.body);
  if (!location) return res.status(400).json({ error: "坐标无效" });
  const label = String(req.body?.label ?? "").trim().normalize("NFKC");
  if (label.length > 48) return res.status(400).json({ error: "名称最多 48 个字符" });
  const suppliedTime = req.body?.time ? new Date(req.body.time) : new Date();
  if (Number.isNaN(suppliedTime.getTime())) return res.status(400).json({ error: "记录时间无效" });

  try {
    // The name of the spot is looked up here rather than trusted from the
    // client, so a mark reads the same however it was saved.
    const place = await lookupPlace(location.latitude, location.longitude, requestedLang(req)).catch(() => null);
    const mark = createMark(req.user.id, {
      ...location,
      time: suppliedTime.toISOString(),
      label: label || null,
      place: place ? [place.locality, place.name, place.region].filter(Boolean).join(" · ") : null,
    });
    res.status(201).json({ mark });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/marks/:markId", requireSession, (req, res) => {
  const markId = Number(req.params.markId);
  if (!Number.isInteger(markId) || markId < 1) return res.status(400).json({ error: "记录 ID 无效" });
  const label = String(req.body?.label ?? "").trim().normalize("NFKC");
  if (label.length > 48) return res.status(400).json({ error: "名称最多 48 个字符" });
  const mark = renameMark(req.user.id, markId, label || null);
  if (!mark) return res.status(404).json({ error: "记录不存在", code: "MARK_NOT_FOUND" });
  res.json({ mark });
});

app.delete("/api/marks/:markId", requireSession, (req, res) => {
  const markId = Number(req.params.markId);
  if (!Number.isInteger(markId) || markId < 1) return res.status(400).json({ error: "记录 ID 无效" });
  if (!deleteMark(req.user.id, markId)) {
    return res.status(404).json({ error: "记录不存在", code: "MARK_NOT_FOUND" });
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

app.post("/api/posts", requireSession, async (req, res, next) => {
  const location = parseLocation(req.body);
  if (!location) return res.status(400).json({ error: "坐标无效" });
  const body = String(req.body?.body ?? "").trim().normalize("NFKC");
  if (body.length > POST_BODY_MAX) {
    return res.status(400).json({ error: `内容最多 ${POST_BODY_MAX} 个字符` });
  }

  // The photo arrives as a name /api/images already wrote, never as bytes —
  // anything else would let this endpoint name a file of its own choosing.
  const image = req.body?.image ? String(req.body.image) : null;
  if (image && !isStoredName(image)) return res.status(400).json({ error: "图片无效" });
  if (!body && !image) return res.status(400).json({ error: "请写点什么，或者添加一张图片" });

  const dimension = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
  };
  const suppliedTime = req.body?.time ? new Date(req.body.time) : new Date();
  if (Number.isNaN(suppliedTime.getTime())) return res.status(400).json({ error: "记录时间无效" });

  try {
    // Looked up here rather than trusted from the client, for the same reason a
    // mark's is: the place name is what the post is filed under, and it should
    // read the same however the post was made.
    const place = await lookupPlace(location.latitude, location.longitude, requestedLang(req)).catch(() => null);
    const post = createPost(req.user.id, {
      ...location,
      time: suppliedTime.toISOString(),
      body,
      image,
      imageWidth: dimension(req.body?.imageWidth),
      imageHeight: dimension(req.body?.imageHeight),
      place: place ? [place.locality, place.name, place.region].filter(Boolean).join(" · ") : null,
    });
    res.status(201).json({ post });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/posts/:postId", requireSession, (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "帖子 ID 无效" });
  // The image file stays: it is named after its own bytes, so another post may
  // be pointing at the same one.
  if (!deletePost(req.user.id, postId)) {
    return res.status(404).json({ error: "帖子不存在", code: "POST_NOT_FOUND" });
  }
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
      return res.status(400).json({ error: "图片为空" });
    }
    try {
      const stored = await storeImage(req.body);
      if (!stored) return res.status(415).json({ error: "不支持的图片格式" });
      res.json(stored);
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/images/:name", requireSession, (req, res) => {
  const file = imageFile(req.params.name);
  if (!file) return res.status(400).json({ error: "图片名称无效" });
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
      if (error.code === "ENOENT") return res.status(404).json({ error: "图片不存在" });
      res.status(500).json({ error: "服务器错误" });
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

app.get("/api/people", requireSession, (req, res) => {
  res.json({ people: livePeople(req.user.id) });
});

// Telling the server where you are and asking who else is out are the same
// question a minute apart, so they are one round trip rather than two.
app.put("/api/position", requireSession, (req, res) => {
  const location = parseLocation(req.body);
  if (!location) return res.status(400).json({ error: "坐标无效" });
  savePosition(req.user.id, location);
  res.json({ people: livePeople(req.user.id) });
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
    return res.status(413).json({ error: "文件过大" });
  }
  console.error(error);
  res.status(500).json({ error: "服务器错误" });
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
