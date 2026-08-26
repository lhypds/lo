import i18n from "./i18n/index.js";

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
    ...options,
  });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "请求失败");
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

// Every location endpoint answers in the language the interface is showing, so
// the place name under the clock matches the words around it.
function geoQuery({ latitude, longitude }) {
  return `lat=${latitude}&lon=${longitude}&lang=${i18n.language || "en"}`;
}

export const getSession = () => request("/api/session");
export const login = (username) =>
  request("/api/login", { method: "POST", body: JSON.stringify({ username }) });
export const createUser = (username) =>
  request("/api/users", { method: "POST", body: JSON.stringify({ username }) });
export const logout = () => request("/api/logout", { method: "POST" });
export const getMe = () => request("/api/me");
// The whole profile every time, which is what makes an emptied field a cleared
// one rather than an untouched one.
export const updateProfile = (profile) =>
  request("/api/me", { method: "PATCH", body: JSON.stringify(profile) });
// Somebody else: who they are, how to reach them, and what they have left lying
// around. One request, because a page about a person answers all three at once.
export const getUser = (username) => request(`/api/users/${encodeURIComponent(username)}`);

// Everyone you have a conversation with, newest first. It carries the unread
// count with it, so the dot on the envelope and the sheet behind it are one
// answer.
export const getThreads = () => request("/api/messages");
// Asking for a thread is what reads it — there is no separate call for that.
export const getConversation = (username) => request(`/api/messages/${encodeURIComponent(username)}`);
export const sendMessage = (to, body) =>
  request("/api/messages", { method: "POST", body: JSON.stringify({ to, body }) });

export const getLocal = (coords) => request(`/api/local?${geoQuery(coords)}`);
export const getNearby = (coords) => request(`/api/nearby?${geoQuery(coords)}`);
export const getEvents = (coords) => request(`/api/events?${geoQuery(coords)}`);
export const getTrends = (coords) => request(`/api/trends?${geoQuery(coords)}`);
// The one reading that does not take the interface language: Yahoo answers in
// Japanese, and the words the card can translate it translates itself.
export const getWarnings = ({ latitude, longitude }) =>
  request(`/api/warnings?lat=${latitude}&lon=${longitude}`);

// Publishing a fix answers with everyone else's, so the map's minute costs one
// request; the plain GET is for a reader who has no fix of their own to trade.
export const publishPosition = ({ latitude, longitude, accuracy }) =>
  request("/api/position", { method: "PUT", body: JSON.stringify({ latitude, longitude, accuracy }) });
export const getPeople = () => request("/api/people");

// Posts are everyone's, so the map asks for the ones near it rather than for
// its own; with no fix to ask from, the newest anywhere is the best there is.
export const getPosts = (coords) => request(coords ? `/api/posts?${geoQuery(coords)}` : "/api/posts");
export const createPost = (post) =>
  request(`/api/posts?lang=${i18n.language || "en"}`, { method: "POST", body: JSON.stringify(post) });
// The words and the photo only — a post stays where and when it was left, so
// there is no language to answer in and no place to look up again.
export const updatePost = (postId, post) =>
  request(`/api/posts/${postId}`, { method: "PATCH", body: JSON.stringify(post) });
export const deletePost = (postId) => request(`/api/posts/${postId}`, { method: "DELETE" });

export const getMarks = (limit) => request(limit ? `/api/marks?limit=${limit}` : "/api/marks");
export const createMark = (mark) =>
  request(`/api/marks?lang=${i18n.language || "en"}`, { method: "POST", body: JSON.stringify(mark) });
export const renameMark = (markId, label) =>
  request(`/api/marks/${markId}`, { method: "PATCH", body: JSON.stringify({ label }) });
export const deleteMark = (markId) => request(`/api/marks/${markId}`, { method: "DELETE" });
