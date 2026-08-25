// Everything the app knows about "here" comes from this file. The browser hands
// over a pair of coordinates and nothing else, so the server turns them into a
// place name, a clock, a sky and a list of what is happening nearby.
//
// Four of the five upstreams are key-free public APIs:
// - BigDataCloud   — reverse geocoding      https://www.bigdatacloud.com
// - Open-Meteo     — weather and timezone   https://open-meteo.com
// - Google News    — local news (RSS)       https://news.google.com/rss
// - Wikipedia      — nearby places          https://www.mediawiki.org/wiki/API
//
// The fifth is not, and is the only paid thing the server talks to:
// - X             — trending topics         https://docs.x.com/x-api/trends
//   Metered per request and gated on X_BEARER_TOKEN. Everything above keeps
//   working when that token is absent; only the trends card notices.
//
// Requests are coarse-keyed and cached: a phone reporting a position every few
// seconds keeps hitting the same cache entry rather than the same upstream.

const USER_AGENT = "Mozilla/5.0 (compatible; lo/0.1; location dashboard)";
const UPSTREAM_TIMEOUT_MS = 8000;

const PLACE_TTL_MS = 24 * 60 * 60 * 1000;
const WEATHER_TTL_MS = 10 * 60 * 1000;
const NEWS_TTL_MS = 30 * 60 * 1000;
// News that only came back as "here is what is around you" is a fallback, not
// an answer — it is kept briefly so the next visit tries the newswire again.
const NEWS_FALLBACK_TTL_MS = 5 * 60 * 1000;

// Cache precision, in decimal degrees. Three places is ~110 m — fine enough that
// the place name and the weather still belong to where you are standing.
const PLACE_GRID = 2; // ~1.1 km — a city name does not change street by street
const WEATHER_GRID = 2;
const NEWS_GRID = 1; // ~11 km — local news is a city-wide question

const cache = new Map(); // key -> { expiresAt, value } | { pending: Promise }

function gridKey(latitude, longitude, digits) {
  return `${latitude.toFixed(digits)},${longitude.toFixed(digits)}`;
}

// One flight per key: ten cards asking at once produce a single upstream call,
// and a failure is never cached, so the next attempt tries again for real.
// ttl may be a function of the value, for answers whose worth varies.
function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit?.pending) return hit.pending;
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value);

  const pending = load()
    .then((value) => {
      const ttlMs = typeof ttl === "function" ? ttl(value) : ttl;
      cache.set(key, { expiresAt: Date.now() + ttlMs, value });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, { pending });
  return pending;
}

async function getText(url, accept) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} returned HTTP ${response.status}`);
  return response.text();
}

async function getJson(url) {
  // Some of these services answer a request they dislike with a plain-text
  // apology under a 200, so the body is parsed by hand rather than by
  // response.json() — which would report a syntax error and hide the reason.
  const text = await getText(url, "application/json");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${new URL(url).host} returned a non-JSON body`);
  }
}

/* ------------------------------------------------------------------ place -- */

const PLACE_LANGUAGE = { en: "en", zh: "zh", ja: "ja" };

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function lookupPlace(latitude, longitude, lang = "en") {
  const language = PLACE_LANGUAGE[lang] ?? "en";
  return cached(`place:${language}:${gridKey(latitude, longitude, PLACE_GRID)}`, PLACE_TTL_MS, async () => {
    const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("localityLanguage", language);
    const data = await getJson(url.href);

    // city is empty out in the countryside, where locality is the village and
    // principalSubdivision the prefecture — take whichever exists, widest last.
    const name = firstString(data.city, data.locality, data.principalSubdivision, data.countryName);
    const region = firstString(data.principalSubdivision, data.countryName);
    return {
      name,
      locality: firstString(data.locality),
      region: region === name ? "" : region,
      country: firstString(data.countryName),
      countryCode: firstString(data.countryCode),
    };
  });
}

/* ---------------------------------------------------------------- weather -- */

export function lookupWeather(latitude, longitude) {
  return cached(`weather:${gridKey(latitude, longitude, WEATHER_GRID)}`, WEATHER_TTL_MS, async () => {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
    );
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset");
    // timezone=auto is what makes the clock card local rather than the visitor's:
    // the response carries the IANA zone of the coordinates themselves.
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "3");
    const data = await getJson(url.href);

    const current = data.current ?? {};
    const daily = data.daily ?? {};
    const days = (daily.time ?? []).map((date, index) => ({
      date,
      weatherCode: daily.weather_code?.[index] ?? null,
      tempMax: daily.temperature_2m_max?.[index] ?? null,
      tempMin: daily.temperature_2m_min?.[index] ?? null,
      sunrise: daily.sunrise?.[index] ?? null,
      sunset: daily.sunset?.[index] ?? null,
    }));

    return {
      timezone: {
        id: data.timezone ?? "UTC",
        abbreviation: data.timezone_abbreviation ?? "",
        offsetSeconds: data.utc_offset_seconds ?? 0,
      },
      current: {
        time: current.time ?? null,
        temperature: current.temperature_2m ?? null,
        apparent: current.apparent_temperature ?? null,
        humidity: current.relative_humidity_2m ?? null,
        weatherCode: current.weather_code ?? null,
        windSpeed: current.wind_speed_10m ?? null,
        isDay: current.is_day === 1,
      },
      today: days[0] ?? null,
      upcoming: days.slice(1),
      units: {
        temperature: data.current_units?.temperature_2m ?? "°C",
        wind: data.current_units?.wind_speed_10m ?? "km/h",
      },
    };
  });
}

/* ----------------------------------------------------------------- nearby -- */

const NEWS_HOST = "https://news.google.com/rss";
// Google News keys a feed by three things: the reading language (hl), the
// edition's country (gl), and the pair again as ceid.
const NEWS_LANGUAGE = { en: { hl: "en-US", ceid: "en" }, ja: { hl: "ja", ceid: "ja" }, zh: { hl: "zh-CN", ceid: "zh-Hans" } };

function countryFor(countryCode) {
  return /^[A-Za-z]{2}$/.test(countryCode ?? "") ? countryCode.toUpperCase() : "US";
}

// The reader's own language, where an edition for it exists.
function readerLocale(lang, countryCode) {
  const { hl, ceid } = NEWS_LANGUAGE[lang] ?? NEWS_LANGUAGE.en;
  const gl = countryFor(countryCode);
  return `hl=${hl}&gl=${gl}&ceid=${gl}:${ceid}`;
}

// The place's own edition, whatever language that turns out to be. Naming a
// country and no language is what asks for it — and it is the only form that
// reliably has a section for somewhere like Kyoto, which the English edition of
// Google News does not carry at all. Local news in the local language beats
// worldwide chatter that merely mentions the city's name.
function nativeLocale(countryCode) {
  return `gl=${countryFor(countryCode)}`;
}

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (whole, name) => XML_ENTITIES[name] ?? whole)
    .trim();
}

function tagContent(item, tag) {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(item);
  return match ? decodeXml(match[1]) : "";
}

// Google puts the outlet in a <source> element and then repeats it on the end
// of the headline as " - Outlet"; the card shows it once, in its own line.
function stripSourceSuffix(title, source) {
  if (!source) return title;
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

async function fetchNewsFeed(url) {
  const xml = await getText(url, "application/rss+xml, application/xml");
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => {
      const source = tagContent(item, "source");
      const title = stripSourceSuffix(tagContent(item, "title"), source);
      const link = tagContent(item, "link");
      const published = Date.parse(tagContent(item, "pubDate"));
      return {
        kind: "news",
        title,
        url: link,
        source,
        time: Number.isNaN(published) ? null : new Date(published).toISOString(),
      };
    })
    .filter((item) => item.title && item.url);
}

// The place's own news section, which is what "local news" actually means here:
// a ward-level section carries the street it is on, not the country it is in.
function geoSectionUrl(place, locale) {
  return `${NEWS_HOST}/headlines/section/geo/${encodeURIComponent(place)}?${locale}`;
}

function searchUrl(query, locale) {
  return `${NEWS_HOST}/search?q=${encodeURIComponent(query)}&${locale}`;
}

async function fetchWikipediaNearby(latitude, longitude, lang) {
  const host = `https://${lang}.wikipedia.org`;
  const url = new URL(`${host}/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "geosearch");
  url.searchParams.set("gscoord", `${latitude}|${longitude}`);
  url.searchParams.set("gsradius", "10000");
  url.searchParams.set("gslimit", "12");
  url.searchParams.set("format", "json");
  const data = await getJson(url.href);
  return (data.query?.geosearch ?? []).map((place) => ({
    kind: "place",
    title: String(place.title),
    url: `${host}/wiki/${encodeURIComponent(String(place.title).replace(/ /g, "_"))}`,
    source: `${lang}.wikipedia.org`,
    time: null,
    distance: typeof place.dist === "number" ? Math.round(place.dist) : null,
  }));
}

// The same story from six outlets is one story; the first copy through wins,
// because the feed already sorted them newest first.
function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function lookupNearby(latitude, longitude, lang = "en") {
  const language = PLACE_LANGUAGE[lang] ?? "en";
  const key = `nearby:${language}:${gridKey(latitude, longitude, NEWS_GRID)}`;
  const ttl = (value) => (value.items[0]?.kind === "place" ? NEWS_FALLBACK_TTL_MS : NEWS_TTL_MS);

  return cached(key, ttl, async () => {
    const place = await lookupPlace(latitude, longitude, language).catch(() => null);
    const reader = readerLocale(language, place?.countryCode);
    const native = nativeLocale(place?.countryCode);

    // Narrowest name first, and the reader's own edition before the local one:
    // the ward beats the city, the city beats the prefecture, and a section in
    // a language you read beats one you do not.
    const names = [];
    for (const name of [place?.locality, place?.name, place?.region]) {
      if (name && !names.includes(name)) names.push(name);
    }
    const attempts = [
      ...names.map((name) => geoSectionUrl(name, reader)),
      ...names.map((name) => geoSectionUrl(name, native)),
      // Nowhere with a section of its own — ask for the name as a search term.
      ...(place?.name ? [searchUrl(place.name, reader)] : []),
    ];

    let items = [];
    for (const url of attempts) {
      const batch = await fetchNewsFeed(url).catch(() => []);
      if (batch.length > 0) {
        items = batch;
        break;
      }
    }

    // Nowhere with news of its own, or the newswire is unreachable — say what is
    // around instead, which is still an answer to "what is near me".
    if (items.length === 0) {
      items = await fetchWikipediaNearby(latitude, longitude, language).catch(() => []);
    }

    return { place, items: dedupe(items).slice(0, 20) };
  });
}

/* ----------------------------------------------------------------- events -- */

// What the newswire says is on this week.
//
// One word per language the app speaks, ORed together, because the event worth
// knowing about is written up in the language of the place and not necessarily
// in the reader's: a Chinese reader in Kyoto wants 嵯峨天皇祭, and searching for
// 活动 alone finds them 部活動 — school clubs — instead.
const EVENT_TERMS = "(イベント OR events OR 活动 OR 祭)";
// An event is stale the moment it is over, so the listing only looks back a
// fortnight — long enough to catch a run that is still going.
const EVENT_WINDOW = "when:14d";
const EVENTS_TTL_MS = 30 * 60 * 1000;
// Nothing found is worth asking again about soon; a full answer keeps.
const EVENTS_EMPTY_TTL_MS = 5 * 60 * 1000;
const MAX_EVENT_ITEMS = 12;

// City level, not ward level: a ward has its own news, but its events get
// written up under the name of the city they are in.
async function fetchEventNews(place, locale) {
  for (const name of [place?.name, place?.region].filter(Boolean)) {
    const batch = await fetchNewsFeed(searchUrl(`${name} ${EVENT_TERMS} ${EVENT_WINDOW}`, locale)).catch(() => []);
    if (batch.length > 0) return batch;
  }
  return [];
}

export function lookupEvents(latitude, longitude, lang = "en") {
  const language = PLACE_LANGUAGE[lang] ?? "en";
  const key = `events:${language}:${gridKey(latitude, longitude, NEWS_GRID)}`;
  const ttl = (value) => (value.items.length === 0 ? EVENTS_EMPTY_TTL_MS : EVENTS_TTL_MS);

  return cached(key, ttl, async () => {
    const place = await lookupPlace(latitude, longitude, language).catch(() => null);
    const items = await fetchEventNews(place, readerLocale(language, place?.countryCode));
    return { place, items: dedupe(items).slice(0, MAX_EVENT_ITEMS) };
  });
}

/* ----------------------------------------------------------------- trends -- */

// What X says is spiking where you are. The only upstream here that costs money
// and the only one that can be switched off: with no token the card is told so
// and the rest of the dashboard carries on.
const TRENDS_HOST = "https://api.x.com/2";
// Every call is billed, so the TTL is the cost dial rather than a freshness
// one — 30 min is ~48 calls a day per location, and the cache is keyed on the
// WOEID, not the fix, so a whole city shares one entry.
const TRENDS_TTL_MS = 30 * 60 * 1000;
const TRENDS_EMPTY_TTL_MS = 10 * 60 * 1000;
const MAX_TRENDS = 20;

// X answers per WOEID — Yahoo's retired "Where On Earth" id. v1.1 had
// trends/closest, which turned a pair of coordinates into the nearest id X
// actually supports; it went away with v1.1 and v2 replaced it with nothing.
// There is no endpoint that lists the supported locations either, so the table
// has to live here.
//
// It holds only ids X's own documentation states, because the failure mode of a
// guess is silent: a wrong-but-valid WOEID returns another city's trends under
// your city's name, which is worse than showing no card at all. An id X does
// not support comes back as an empty list rather than an error, so adding a row
// is safe — but source it, do not infer it.
// https://docs.x.com/x-api/trends/trends-by-woeid/introduction
const WORLDWIDE_WOEID = 1;

const TREND_CITIES = [
  { woeid: 1118370, name: "Tokyo", latitude: 35.6895, longitude: 139.6917 },
  { woeid: 2459115, name: "New York", latitude: 40.7128, longitude: -74.006 },
  { woeid: 2442047, name: "Los Angeles", latitude: 34.0522, longitude: -118.2437 },
  { woeid: 44418, name: "London", latitude: 51.5074, longitude: -0.1278 },
];

const TREND_COUNTRIES = {
  JP: { woeid: 23424856, name: "Japan" },
  US: { woeid: 23424977, name: "United States" },
  GB: { woeid: 23424975, name: "United Kingdom" },
};

// A metro WOEID speaks for its metro, not its centre point: Yokohama is Tokyo's
// trends as far as X is concerned, and 80 km is about where that stops being
// true anywhere in the table.
const TREND_CITY_RADIUS_M = 80_000;

const EARTH_RADIUS_M = 6_371_008.8;

function distanceMeters(latitude, longitude, target) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const lat1 = rad(latitude);
  const lat2 = rad(target.latitude);
  const dLat = lat2 - lat1;
  const dLon = rad(target.longitude - longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Nearest supported metro, else the country, else the world — narrowing as far
// as the table allows and saying which rung it landed on, because "trending in
// Japan" and "trending in Tokyo" are different claims and the card makes it
// clear which one it is showing.
function resolveWoeid(latitude, longitude, countryCode) {
  let nearest = null;
  for (const city of TREND_CITIES) {
    const distance = distanceMeters(latitude, longitude, city);
    if (distance <= TREND_CITY_RADIUS_M && (!nearest || distance < nearest.distance)) {
      nearest = { ...city, distance };
    }
  }
  if (nearest) return { woeid: nearest.woeid, name: nearest.name, scope: "city" };

  const country = TREND_COUNTRIES[String(countryCode ?? "").toUpperCase()];
  if (country) return { woeid: country.woeid, name: country.name, scope: "country" };

  return { woeid: WORLDWIDE_WOEID, name: "Worldwide", scope: "world" };
}

async function fetchTrends(woeid, token) {
  const url = new URL(`${TRENDS_HOST}/trends/by/woeid/${woeid}`);
  url.searchParams.set("max_trends", String(MAX_TRENDS));
  url.searchParams.set("trend.fields", "trend_name,tweet_count");

  const response = await fetch(url.href, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  // A bad token and an exhausted balance are both things the operator has to go
  // and fix, so they are named rather than folded into a generic failure. The
  // balance one is not a one-off: credits run down silently, and a card that
  // has been working for weeks stops on a 402 with nothing else changed.
  if (response.status === 401 || response.status === 403) throw new Error("X rejected the bearer token");
  if (response.status === 402) throw new Error("X credits depleted — top up at https://console.x.com");
  if (response.status === 429) throw new Error("X rate limit reached");
  if (!response.ok) throw new Error(`api.x.com returned HTTP ${response.status}`);

  const data = await response.json().catch(() => ({}));
  return (Array.isArray(data.data) ? data.data : [])
    .filter((trend) => typeof trend.trend_name === "string" && trend.trend_name.trim())
    .map((trend) => ({
      name: trend.trend_name.trim(),
      // Optional in the schema, and absent for plenty of live trends — the card
      // has to render a trend that will not say how big it is.
      count: Number.isFinite(trend.tweet_count) ? trend.tweet_count : null,
      // A public search URL, so tapping a trend costs nothing and needs no key.
      url: `https://x.com/search?q=${encodeURIComponent(trend.trend_name)}`,
    }));
}

export function trendsConfigured() {
  return Boolean(process.env.X_BEARER_TOKEN);
}

export function lookupTrends(latitude, longitude, lang = "en") {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return Promise.resolve({ configured: false, items: [] });

  const language = PLACE_LANGUAGE[lang] ?? "en";
  const ttl = (value) => (value.items.length === 0 ? TRENDS_EMPTY_TTL_MS : TRENDS_TTL_MS);

  return cached(`trends-where:${language}:${gridKey(latitude, longitude, PLACE_GRID)}`, PLACE_TTL_MS, () =>
    lookupPlace(latitude, longitude, language)
      .catch(() => null)
      .then((place) => resolveWoeid(latitude, longitude, place?.countryCode)),
  ).then((where) =>
    // Keyed on the WOEID alone: every reader in the metro is asking X the same
    // question, and X's answer is in the language of the place either way.
    cached(`trends:${where.woeid}`, ttl, async () => {
      const items = await fetchTrends(where.woeid, token);
      return { configured: true, ...where, items };
    }),
  );
}
