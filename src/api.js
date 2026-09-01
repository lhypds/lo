import i18n from "./i18n/index.js";
import { tellHost } from "./utils/host.js";

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

// Whether this browser is holding a token at all. Not whether it is any good —
// only the server can say that, and only a 401 is it saying so — but the
// difference between a load that has a session to ask about and one that has
// nothing to ask about. Which is what lets a server that could not be reached be
// told apart from nobody being signed in (see AuthProvider).
export function hasSession() {
  return Boolean(sessionToken);
}

// A request that has lost its connection must eventually make room for the next
// turn of a poller. Browsers put no useful upper bound on fetch by themselves,
// which is especially visible in an embedded WebView moving between networks:
// the promise can remain pending long after the screen that asked for it has
// gone. Thirty seconds is above every ordinary lo read while still bounding the
// number of dead requests a recurring read can leave behind.
const REQUEST_TIMEOUT_MS = 30 * 1000;

async function request(path, options = {}) {
  // `timeoutMs` is an option for lo rather than for fetch. The venue endpoints
  // may legitimately wait behind Overpass's public queue, so those two give
  // themselves a larger budget below; everything else takes the common one.
  const { timeoutMs = REQUEST_TIMEOUT_MS, signal: sourceSignal, ...fetchOptions } = options;
  const headers = {
    ...(fetchOptions.body ? { "Content-Type": "application/json" } : null),
    ...fetchOptions.headers,
    ...authHeaders(),
  };
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(sourceSignal?.reason);
  if (sourceSignal?.aborted) abort();
  else sourceSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(path, {
      credentials: "omit",
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    if (response.status === 204) return null;
    let data;
    try {
      data = await response.json();
    } catch (error) {
      // A response without JSON has always been read as an empty answer. An
      // aborted body is different: swallowing it here would turn a timeout into
      // a successful `{}` just because the headers arrived first.
      if (controller.signal.aborted) throw error;
      data = {};
    }
    if (!response.ok) {
      // A token the server no longer knows because it aged out or was revoked.
      // Thrown away here rather than presented on every request from now on, so
      // that what follows is a login screen rather than a loop.
      if (response.status === 401 && data.code === "LOGIN_REQUIRED") dropSession();
      const error = new Error(data.error || "Request failed");
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    return data;
  } catch (error) {
    if (!timedOut) throw error;
    const timeout = new Error("Request timed out");
    timeout.code = "REQUEST_TIMEOUT";
    throw timeout;
  } finally {
    clearTimeout(timer);
    sourceSignal?.removeEventListener("abort", abort);
  }
}

// Every location endpoint answers in the language the interface is showing, so
// the place name under the clock matches the words around it.
function geoQuery({ latitude, longitude }) {
  return `lat=${latitude}&lon=${longitude}&lang=${i18n.language || "en"}`;
}

// One answer, handed on to whoever is hosting lo in a frame.
//
// lo and the Even Hub package are two clients of one server reading it off one
// phone at once, and they read most of the same things: the package feeds a pair
// of glasses the same place, the same sky, the same street, the same list of who
// is about (see lo-even/src/services/feeds.ts). So an answer lo has just landed
// is an answer the package was about to go and ask for itself, and one line over
// the frame is a request it never makes.
//
// How much that saves is the reader's own doing rather than a figure to quote.
// Who else is about is traded every minute whichever half asks, so that one is
// saved on every launch; the rest follow whichever panels the reader has put on
// this dashboard, because a card that is not on the page fetches nothing to
// hand over. The package asks for everything it lacks exactly as it always did.
//
// Named for the feed rather than for the address, because the package holds one
// slot per feed and has no interest in which of lo's endpoints filled it.
//
// **What crosses, and what does not.** Everything wrapped in this is either a
// read lo's own server answers with no session at all — the place, the sky, what
// is on, where to eat, what is in force — or it is what is on the ground here
// and who else is standing on it, which is what lo shows to every signed-in
// reader who walks down this street. Nothing addressed to the reader personally
// goes through here: not the inbox, not an exchange, not a column of remarks.
//
// The line is drawn there because it cannot be drawn round the audience. lo can
// be framed by anybody, and the package's own origin is not a thing lo could
// name in advance (see utils/host.js) — so what a page that framed lo uninvited
// would learn from all of this is what it could have asked the server for
// itself, bar where the reader is standing, which the fix has already said.
function shared(feed, coords, answer) {
  return answer.then((data) => {
    tellHost("feed", {
      feed,
      // The question this is the answer to. The host holds every feed under the
      // ground it is about and the language it was asked in, and an answer
      // arriving without those is one it cannot tell from an answer about
      // somewhere else. Both go on every feed and are read only where they mean
      // something: who else is about is a question with no ground in it, and
      // what is in force comes back in Japanese whatever lo is being read in.
      lang: i18n.language || "en",
      // Not always where the reader is standing. The venue cards hold an anchor
      // and re-ask only once it is a hundred metres behind them (see
      // VenuesCard), so what goes over is the ground the answer is about.
      coords: coords ? { latitude: coords.latitude, longitude: coords.longitude } : null,
      data,
    });
    return data;
  });
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
// How lo is shown to this reader, kept for the account rather than for the
// browser: a patch of the fields being answered and never the whole object, so
// that a device saving the map style does not undo what another one has just
// decided about the dashboard (see utils/settings.js and server/users.js).
export const saveSettings = (settings) =>
  request("/api/me/settings", { method: "PUT", body: JSON.stringify(settings) });

// Everything lo is holding for this account, as a zip of its own folder.
//
// Fetched here rather than followed as a link, for the reason the pictures are
// (see authImageUrl): nothing in lo is authenticated by anything the browser
// attaches on its own, so a navigation to this address would arrive without the
// session and come back a 401. The bytes are fetched where the header can be
// put on, and the download is started from the blob.
export async function downloadExport(username) {
  const response = await fetch(`/api/users/${encodeURIComponent(username)}/export.zip`, {
    credentials: "omit",
    headers: authHeaders(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || "Export failed");
    error.status = response.status;
    throw error;
  }
  // The name the server chose, which carries the account and the moment. Read off
  // the header rather than built again here, so the file is called what the
  // server says it is called.
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="([^"]+)"/i.exec(disposition)?.[1];
  const filename = (encoded ? decodeURIComponent(encoded) : plain) || "lo-export.zip";

  startDownload(await response.blob(), filename);
}

// Bytes already in hand, handed to the browser as a file. A link that is made,
// pressed and thrown away in the same breath, because there is no other way to
// give a browser a name to save something under.
function startDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Freed on the next turn rather than straight away: revoking it in the same
  // tick can beat the browser to the download it has just been handed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

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

export const getLocal = (coords) => shared("local", coords, request(`/api/local?${geoQuery(coords)}`));
// What a spot somewhere else is called, as the one line it is filed under. Not
// handed to the host with the rest of them: the feeds above are all answers
// about the ground the reader is standing on, and this is a question asked about
// a mark that may be a country away from it.
export const getPlace = (coords) => request(`/api/place?${geoQuery(coords)}`);
export const getNearby = (coords) => shared("nearby", coords, request(`/api/nearby?${geoQuery(coords)}`));
export const getEvents = (coords) => shared("events", coords, request(`/api/events?${geoQuery(coords)}`));
export const getTrends = (coords) => shared("trends", coords, request(`/api/trends?${geoQuery(coords)}`));
// The stations broadcasting around here, nearest the server could rank them
// first, every one of them already knocked on — a row that comes back is a row
// that plays (see lookupRadio in server/geo.js).
export const getRadio = (coords) => shared("radio", coords, request(`/api/radio?${geoQuery(coords)}`));
// Somewhere to eat and somewhere for a coffee, nearest first. Two addresses
// rather than one with a kind hung off it, because they are two cards and a
// reader may well carry one of them without the other.
// The server queues its Overpass queries one at a time and walks a list of
// public instances until one of them answers, so these two reads can genuinely
// take a while — a card waiting behind the other one, each with half a minute of
// mirrors to get through. Room to finish, and still a bound on a dead
// connection (see askOverpass in server/geo.js).
const VENUE_REQUEST_TIMEOUT_MS = 90 * 1000;
export const getFood = (coords) =>
  shared("food", coords, request(`/api/food?${geoQuery(coords)}`, { timeoutMs: VENUE_REQUEST_TIMEOUT_MS }));
export const getCafes = (coords) =>
  shared("cafe", coords, request(`/api/cafe?${geoQuery(coords)}`, { timeoutMs: VENUE_REQUEST_TIMEOUT_MS }));
// Wikipedia articles carrying a coordinate nearby, lead paragraph and picture
// included — nearest first, the same shape the two calls above answer in.
export const getWikipedia = (coords) =>
  shared("wikipedia", coords, request(`/api/wikipedia?${geoQuery(coords)}`));
// The old photographs taken on this ground, oldest first — Wikimedia Commons'
// geotagged files, already sifted for age (see lookupHistory in server/geo.js).
export const getHistory = (coords) => shared("history", coords, request(`/api/history?${geoQuery(coords)}`));

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
  shared("warnings", { latitude, longitude }, request(`/api/warnings?lat=${latitude}&lon=${longitude}`));

// Publishing a fix answers with everyone else's, so the map's minute costs one
// request; the plain GET is for a reader who has no fix of their own to trade.
//
// Both go to the host as `people`, which is the name it holds the answer under
// and is the same answer either way. No coords with it: who else is out is a
// question about a radius the server draws round its own idea of where we are,
// not about a square this client can name — the host keys it on the minute
// alone, exactly as lo does.
//
// The language does go up, which it did not have to while a row was a name, a
// pair of coordinates and a stamp. A row now carries the region its person is
// standing in — the one part of the answer that is words rather than figures,
// and the reader's own words at that (see the people panel) — so the list is
// asked for in the language it is going to be read in.
export const publishPosition = ({ latitude, longitude, accuracy }) =>
  shared(
    "people",
    null,
    request(`/api/position?lang=${i18n.language || "en"}`, {
      method: "PUT",
      body: JSON.stringify({ latitude, longitude, accuracy }),
    }),
  );
export const getPeople = () => shared("people", null, request(`/api/people?lang=${i18n.language || "en"}`));

// Posts are everyone's, so the map asks for the ones near it rather than for
// its own; with no fix to ask from, the newest anywhere is the best there is.
//
// Shared with the host only when it is about somewhere: the fallback list is the
// newest anywhere, which answers no question the host ever asks — its own posts
// feed is always keyed to the ground under it.
export const getPosts = (coords) =>
  coords ? shared("posts", coords, request(`/api/posts?${geoQuery(coords)}`)) : request("/api/posts");
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

// The same column under an OpenStreetMap venue. Its id is `type/number`; kept as
// two path pieces so the slash is structure rather than an encoded character a
// proxy might decide to decode early.
function venueCommentsPath(venueId) {
  const [type, osmId] = String(venueId).split("/");
  return `/api/venues/${encodeURIComponent(type)}/${encodeURIComponent(osmId)}/comments`;
}

export const getVenueComments = (venueId) => request(venueCommentsPath(venueId));
export const addVenueComment = (venueId, body) =>
  request(venueCommentsPath(venueId), { method: "POST", body: JSON.stringify({ body }) });

// The inbox and the figure the letter in the top bar wears, in one answer: the
// dot says somebody wrote and the list is who and about what — a row is either a
// person you have traded letters with or a post somebody has been writing under.
// The bar asks for this on a beat and hands what comes back to the sheet it
// opens, so opening the inbox costs nothing.
export const getMessages = () => request("/api/messages");
// One exchange, both directions. Asking for it is what marks it read, so the
// unread figure comes back already counted down by this reading.
export const getConversation = (username, options = {}) =>
  request(`/api/messages/${encodeURIComponent(username)}`, options);
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
// A marks.json read back in, merged with the list the account is already keeping
// rather than put over it (see mergeMarks on the server). The file's own text is
// the body, said to be text so that it arrives under that endpoint's limit
// instead of the 32kb every JSON body here is held to — a file is not a request,
// and this one can be a few thousand spots.
export const importMarks = (text) =>
  request("/api/marks/import", {
    method: "POST",
    body: text,
    headers: { "Content-Type": "text/plain" },
  });
// The list on its way out: the account's own marks.json, saved as a file. The
// other half of the verb beside it — what the import reads back is exactly what
// this hands over, so a list carried between devices or accounts makes the round
// trip unchanged.
//
// Not the zip in the top bar, which is the whole folder and a thing to be
// unpacked. Most readers pressing "export" on the marks line want the marks.
//
// Fetched as JSON and written out here rather than sent down as an attachment,
// for the reason the zip cannot be (see downloadExport): a plain navigation to
// the address would arrive without the session. Laid out the way the server lays
// the file out — two spaces, a closing newline — since a marks.json is meant to
// be opened and read.
//
// Called marks.json, with no stamp in the name. It is what the file is called in
// the folder, in the zip, and in the note that explains how to make one; a
// browser asked for it twice writes the second as marks (1).json on its own,
// which is a better answer than a name nobody can say out loud.
export async function downloadMarks() {
  const file = await request("/api/marks/export.json");
  startDownload(new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: "application/json" }), "marks.json");
}
// The name and the photograph, which is the whole of what a spot can be given a
// second thought about — where it is and when it was kept are what it is (see
// PATCH /api/marks). The same sheet writes both, whether it was opened from a
// row in the list, from a pin's bubble, or from the button that just saved one.
//
// The language goes up with the name for the reason it goes up with a new mark:
// a spot is named in the language its namer was reading in, and that is the one
// the name is written under. Read off i18n here rather than asked of the caller,
// so that a sheet opened from a row and a sheet opened from the save button
// cannot disagree about it.
export const updateMark = (markId, content) =>
  request(`/api/marks/${markId}?lang=${i18n.language || "en"}`, {
    method: "PATCH",
    body: JSON.stringify(content),
  });
export const deleteMark = (markId) => request(`/api/marks/${markId}`, { method: "DELETE" });
// The list itself rather than a mark in it, which is what the bare path says:
// what is being asked for is a list with nothing in it, not a removal repeated
// until there is nothing left. What comes back is the number that went, since
// after this the count is zero either way and the figure that went is the only
// thing the reader has not already been told.
export const clearMarks = () => request("/api/marks", { method: "DELETE" });
