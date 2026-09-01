// Coordinates are shown the way a map reads them: north/south first, six
// decimals — about 10 cm, which is finer than any phone can actually claim.
export function formatCoords(latitude, longitude) {
  const lat = `${Math.abs(latitude).toFixed(5)}°${latitude >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(longitude).toFixed(5)}°${longitude >= 0 ? "E" : "W"}`;
  return `${lat} ${lon}`;
}

// A username is never shown bare: the @ is what makes it read as a person
// rather than as a word that happens to be there.
export function formatUsername(username) {
  return `@${username}`;
}

export function formatAccuracy(meters) {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `±${Math.round(meters)}m`;
  return `±${(meters / 1000).toFixed(1)}km`;
}

const EARTH_RADIUS_M = 6_371_008.8;

export function distanceMeters(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const dLat = lat2 - lat1;
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Three significant figures at every scale: a 4m gap reads as 4.2m, a city
// crossing as 12.3km.
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${meters < 10 ? meters.toFixed(1) : Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)}km`;
}

// A country in the reader's language, out of the two letters a position is filed
// under. The browser has the list — every language it can render a date in it can
// also name a country in — so lo carries no table of its own for this and no
// two hundred lines of it in each of the files that hold the rest of the words.
//
// Empty for anything that is not a country code, and empty too when the browser
// hands the code straight back, which is how Intl says it has never heard of it:
// two capitals where a country name should be read as a bug rather than as an
// answer, and the caller has a better thing to fall back on.
// ZZ is the other way it says so — the code CLDR keeps for a region nobody has
// named, which comes back as "Unknown Region" in the reader's own language and
// would sit in the row looking like an answer. Asked for rather than listed,
// since the sentence it comes back as is a different one in every language.
export function formatCountry(code, locale) {
  if (!/^[A-Za-z]{2}$/.test(code ?? "")) return "";
  const region = code.toUpperCase();
  try {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    const name = names.of(region);
    return name === region || name === names.of("ZZ") ? "" : name;
  } catch {
    return "";
  }
}

// "3 min ago" without pulling in a date library: anything older than a week is
// better served by the date itself, which the caller renders instead.
export function relativeTime(iso, locale, t) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 60) return t("time.justNow");
  const units = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
  ];
  let chosen = units[0];
  for (const unit of units) {
    if (seconds >= unit[1]) chosen = unit;
  }
  if (seconds >= 604800) return new Date(time).toLocaleDateString(locale);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return formatter.format(-Math.floor(seconds / chosen[1]), chosen[0]);
}

export function formatDateTime(iso, locale, timeZone) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleString(locale, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
