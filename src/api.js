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

export const getLocal = (coords) => request(`/api/local?${geoQuery(coords)}`);
export const getNearby = (coords) => request(`/api/nearby?${geoQuery(coords)}`);
export const getEvents = (coords) => request(`/api/events?${geoQuery(coords)}`);
export const getTrends = (coords) => request(`/api/trends?${geoQuery(coords)}`);

// Publishing a fix answers with everyone else's, so the map's minute costs one
// request; the plain GET is for a reader who has no fix of their own to trade.
export const publishPosition = ({ latitude, longitude, accuracy }) =>
  request("/api/position", { method: "PUT", body: JSON.stringify({ latitude, longitude, accuracy }) });
export const getPeople = () => request("/api/people");

export const getMarks = (limit) => request(limit ? `/api/marks?limit=${limit}` : "/api/marks");
export const createMark = (mark) =>
  request(`/api/marks?lang=${i18n.language || "en"}`, { method: "POST", body: JSON.stringify(mark) });
export const renameMark = (markId, label) =>
  request(`/api/marks/${markId}`, { method: "PATCH", body: JSON.stringify({ label }) });
export const deleteMark = (markId) => request(`/api/marks/${markId}`, { method: "DELETE" });
