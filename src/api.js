import i18n from "./i18n/index.js";

// One way in, wherever lo is running: the token its session was opened with,
// kept here and presented as `Authorization: Bearer` on every request after.
// The Even Hub package hosts lo in a cross-site iframe, a position from which
// anything the browser would attach by itself does not survive the trip, and a
// header put on by code that already holds the token reads the same everywhere.
// Requests below go out `credentials: "omit"` to say as much outright: nothing
// ambient authenticates anything here, which is CSRF gone rather than fenced
// off, and is what lets the API answer foreign origins at all.
//
// What that costs is worth saying plainly. The token lives in localStorage, so
// an XSS on this page can read it and carry it off, and it stays good for as
// long as the session does.
//
// One request cannot carry a header: an <img> makes its own, with nowhere to
// put one. Pictures therefore go through `authImageUrl`, which fetches the
// bytes here and hands the tag an object URL.
const tokenKey = "lo:session-token";

// Held in memory as well as in storage, because a partitioned or private frame
// is allowed to deny storage outright. Where it does, the session still lasts as
// long as the page is open rather than failing on the very next request.
let sessionToken = "";
try {
  sessionToken = localStorage.getItem(tokenKey) || "";
} catch {
  // Nothing was kept from last time; a key or a password opens a fresh one.
}

// Every answer that opens a session carries the token that opened it — the
// password, the link key, and the request that makes the account. Keeping it is
// the whole of what authenticates the next request.
function keepSession(data) {
  if (!data?.token) return data;
  sessionToken = data.token;
  try {
    localStorage.setItem(tokenKey, sessionToken);
  } catch {
    // Memory alone still carries this page.
  }
  return data;
}

function dropSession() {
  sessionToken = "";
  try {
    localStorage.removeItem(tokenKey);
  } catch {
    // Nothing was kept, so there is nothing to clear.
  }
}

// The one request that cannot go through `request` — the image upload, whose
// body is raw bytes rather than JSON — is authenticated the same way.
export function authHeaders() {
  return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
}

async function request(path, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : null),
    ...options.headers,
    ...authHeaders(),
  };
  const response = await fetch(path, { credentials: "omit", ...options, headers });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // A token the server no longer knows, because it restarted or the session
    // aged out. Thrown away here rather than presented on every request from now
    // on, so that what follows is a login screen rather than a loop.
    if (response.status === 401 && data.code === "LOGIN_REQUIRED") dropSession();
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
  request("/api/login", { method: "POST", body: JSON.stringify({ username, password }) }).then(keepSession);
export const createUser = (username, password) =>
  request("/api/users", { method: "POST", body: JSON.stringify({ username, password }) }).then(keepSession);
// `finally` rather than `then`: a sign-out the server never heard is still a
// sign-out here, and a token kept past it would be the one thing left signed in.
export const logout = () => request("/api/logout", { method: "POST" }).finally(dropSession);
// Signing in on a key instead of a password — the key read out of the fragment
// of the link that was followed, traded for the session the password would have
// opened. The same answer as login, because it is the same session.
export const loginWithKey = (key) =>
  request("/api/link", { method: "POST", body: JSON.stringify({ key }) }).then(keepSession);
export const getMe = () => request("/api/me");
// The whole profile every time, which is what makes an emptied field a cleared
// one rather than an untouched one.
export const updateProfile = (profile) =>
  request("/api/me", { method: "PATCH", body: JSON.stringify(profile) });
// Whether you are one of the dots on everybody else's map. Its own address
// rather than a field of the profile above, because the profile is sent whole
// and an emptied field there means "cleared" — a switch has no such state, and
// putting it in that body would make every save of a bio an answer about this
// too.
export const setDiscoverable = (discoverable) =>
  request("/api/me/discoverable", { method: "PUT", body: JSON.stringify({ discoverable }) });
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

// The words behind a headline, asked for by the row's own link rather than by
// the id the list came back with. The row carries the id as a hint — whether
// there is a reading waiting — but a reader who presses within seconds of the
// list arriving can beat the server to the story, and the link is what lets it
// go and read one on the spot instead of answering "not yet".
export const getArticle = ({ url, title, source, kind }) => {
  const query = new URLSearchParams({ link: url });
  if (title) query.set("title", title);
  if (source) query.set("source", source);
  if (kind) query.set("kind", kind);
  return request(`/api/articles?${query}`);
};
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
//
// The first is also the reading that marks a column read, the way asking for a
// conversation is — so what comes back with it is how much is left waiting
// anywhere, letters and remarks alike, for the dot in the top bar.
export const getComments = (postId) => request(`/api/posts/${postId}/comments`);
export const addComment = (postId, body) =>
  request(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ body }) });

// The inbox and the figure the letter in the top bar wears, in one answer: the
// dot says somebody wrote and the list is who and about what — a row is either a
// person you have traded letters with or a post somebody has been writing under.
// The bar asks for this on a beat and hands what comes back to the sheet it
// opens, so opening the inbox costs nothing.
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
