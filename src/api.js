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
    const error = new Error(data.error || "Request failed");
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
// The first of the two steps signing in is asked in: whether the name is an
// account, and whether it has a password yet. Nobody is signed in by it — what
// comes back is what the password screen needs in order to know whether it is
// asking for a password or asking for one to be chosen.
export const checkUsername = (username) =>
  request("/api/username", { method: "POST", body: JSON.stringify({ username }) });
export const login = (username, password) =>
  request("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
export const createUser = (username, password) =>
  request("/api/users", { method: "POST", body: JSON.stringify({ username, password }) });
export const logout = () => request("/api/logout", { method: "POST" });
// Signing in on a key instead of a password — the key read out of the fragment
// of the link that was followed, traded for the session the password would have
// opened. The same answer as login, because it is the same session.
export const loginWithKey = (key) =>
  request("/api/link", { method: "POST", body: JSON.stringify({ key }) });
export const getMe = () => request("/api/me");
// The whole profile every time, which is what makes an emptied field a cleared
// one rather than an untouched one.
export const updateProfile = (profile) =>
  request("/api/me", { method: "PATCH", body: JSON.stringify(profile) });
// Somebody else: who they are, how to reach them, and what they have left lying
// around. One request, because a page about a person answers all three at once.
export const getUser = (username) => request(`/api/users/${encodeURIComponent(username)}`);

// Following somebody and stopping are the same address with a different verb,
// and both answer with the two figures and the state the button should be
// showing — so the row of them under a name never has to be asked for again.
export const followUser = (username) =>
  request(`/api/users/${encodeURIComponent(username)}/follow`, { method: "PUT" });
export const unfollowUser = (username) =>
  request(`/api/users/${encodeURIComponent(username)}/follow`, { method: "DELETE" });
// The names behind the figures, one list each: asked for when a sheet is opened
// on them rather than with the page, since most readings of a profile never open
// either.
export const getFollowers = (username) => request(`/api/users/${encodeURIComponent(username)}/followers`);
export const getFollowing = (username) => request(`/api/users/${encodeURIComponent(username)}/following`);

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

// What has been said back about one post, and saying something yourself. The
// second answers with the row *and* the figure it has just changed: the sheet
// puts the row at the foot of its column, and the count goes back to the map,
// where the corner of a bubble is what said there was anything to open.
export const getComments = (postId) => request(`/api/posts/${postId}/comments`);
export const addComment = (postId, body) =>
  request(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ body }) });

// The inbox and the figure the letter in the top bar wears, in one answer: the
// dot says somebody wrote and the list is who, which is one reading of one
// table. The bar asks for this on a beat and hands what comes back to the sheet
// it opens, so opening the inbox costs nothing.
export const getMessages = () => request("/api/messages");
// One exchange, both directions. Asking for it is what marks it read, so the
// unread figure comes back already counted down by this reading.
export const getConversation = (username) =>
  request(`/api/messages/${encodeURIComponent(username)}`);
export const sendMessage = (username, body) =>
  request(`/api/messages/${encodeURIComponent(username)}`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
export const deleteConversation = (username) =>
  request(`/api/messages/${encodeURIComponent(username)}`, { method: "DELETE" });

export const getMarks = (limit) => request(limit ? `/api/marks?limit=${limit}` : "/api/marks");
export const createMark = (mark) =>
  request(`/api/marks?lang=${i18n.language || "en"}`, { method: "POST", body: JSON.stringify(mark) });
export const renameMark = (markId, label) =>
  request(`/api/marks/${markId}`, { method: "PATCH", body: JSON.stringify({ label }) });
export const deleteMark = (markId) => request(`/api/marks/${markId}`, { method: "DELETE" });
