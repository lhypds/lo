// Everything the app knows about "here" comes from this file. The browser hands
// over a pair of coordinates and nothing else, so the server turns them into a
// place name, a clock, a sky and a list of what is happening nearby.
//
// Every upstream here is a key-free public API — the server holds no
// credentials at all, and Mapbox is the browser's business:
// - BigDataCloud   — reverse geocoding       https://www.bigdatacloud.com
// - Open-Meteo     — weather and timezone    https://open-meteo.com
// - Google News    — local news (RSS)        https://news.google.com/rss
// - Google Trends  — trending searches (RSS) https://trends.google.com/trending
// - Wikipedia      — nearby places, articles https://www.mediawiki.org/wiki/API
// - Wikidata       — the same article's other languages https://www.wikidata.org
// - Overpass       — food and cafés (OSM)    https://overpass-api.de
// - Yahoo! 天気・災害 — Japanese weather warnings https://typhoon.yahoo.co.jp
//
// Requests are coarse-keyed and cached: a phone reporting a position every few
// seconds keeps hitting the same cache entry rather than the same upstream.
//
// None of the Google ones cover the whole world, and countries.js is where that
// is written down — so a feed this file would only be told "no" about is never
// asked for at all.

import { setTimeout as sleep } from "node:timers/promises";
import { newsEdition, supports, wikiEdition } from "./countries.js";

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

// How far ahead the hour-by-hour reading runs — the back of the weather card
// (see WeatherHours), which shows as many of them at once as the tile will hold
// and scrolls through the rest. A day, because a day is what an hourly forecast
// is: past that the front of the same card is already answering in days, and a
// reader scrolling for the hours of the day after tomorrow is reading the wrong
// face. The run is sliced here when the answer is fetched and read up to twenty
// minutes later — ten in this cache and ten more in the browser's own (see
// LocationProvider) — so the first of them may be behind by the time it lands
// and is dropped at that end.
const HOURLY_HOURS = 24;

const cache = new Map(); // key -> { expiresAt, value } | { pending: Promise }

function gridKey(latitude, longitude, digits) {
  return `${latitude.toFixed(digits)},${longitude.toFixed(digits)}`;
}

// The middle of the square a fix falls in — the same rounding as the key above,
// as a pair of numbers rather than as a string. Wanted by the one upstream that
// is asked about a circle of ground rather than about a named place: everyone
// sharing a cache entry has to be sharing a circle, or the first reader through
// decides where the next one's neighbourhood is centred.
function gridCentre(latitude, longitude, digits) {
  return { latitude: Number(latitude.toFixed(digits)), longitude: Number(longitude.toFixed(digits)) };
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

// A request that never became an answer: the name would not resolve, the
// handshake was refused or timed out, the connection dropped part-way. None of
// these are a fault in this file — they are somebody else's server having a bad
// minute — and they should read as one in the log and answer as one to the
// browser, rather than arriving as a 500 with a stack trace under it.
const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED", // nothing listening
  "ECONNRESET", // hung up part-way through
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND", // DNS has never heard of it
  "EAI_AGAIN", // DNS could not say just now
  "ETIMEDOUT", // handshake never landed
  "UND_ERR_CONNECT_TIMEOUT",
]);

// fetch reports every transport failure as the same bare `TypeError: fetch
// failed` and files the reason underneath in `cause` — and when a hostname has
// several addresses, as an AggregateError holding one error per address. The
// reason is worth having, so it is dug out here rather than at each of the
// dozen call sites that would otherwise have to know the shape.
function unreachableCodes(error) {
  const cause = error?.cause;
  if (!cause) return [];
  const codes = [cause.code, ...(cause.errors ?? []).map((inner) => inner?.code)];
  return [...new Set(codes.filter((code) => UNREACHABLE_CODES.has(code)))];
}

// Asked by the routes, which owe the reader a 504 and the log a single line for
// these, and a 500 and the whole stack for anything they did not see coming.
// Both the tidied error below and a raw one — articles.js does its own fetching
// and its failures reach the same handler — answer to this.
export function isUpstreamDown(error) {
  if (error?.upstreamDown) return true;
  // AbortSignal.timeout: the upstream had its seconds and did not use them.
  if (error?.name === "TimeoutError") return true;
  return unreachableCodes(error).length > 0;
}

function unreachable(host, reason, cause) {
  const error = new Error(`${host} could not be reached (${reason})`);
  error.upstreamDown = true;
  error.cause = cause;
  // One line, at the point where what went wrong is still known. The callers
  // that degrade quietly — a card that would rather show nothing than an error
  // — swallow the throw a moment from now, and without this the reason a
  // dashboard came up half empty would be nowhere at all.
  console.warn(`upstream: ${error.message}`);
  return error;
}

// `agent` and `timeout` are here for the one upstream that will not take the
// defaults: Overpass turns the User-Agent above away at the door and wants
// longer to think than a feed does (see the venues section below). Everything
// else calls this with two arguments and never learns they exist.
async function getText(url, accept, { agent = USER_AGENT, timeout = UPSTREAM_TIMEOUT_MS } = {}) {
  const host = new URL(url).host;
  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": agent, Accept: accept },
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    if (error.name === "TimeoutError") throw unreachable(host, `no answer in ${timeout} ms`, error);
    const codes = unreachableCodes(error);
    if (codes.length > 0) throw unreachable(host, codes.join(", "), error);
    // Not the network, then — a malformed URL or a bug in the lines above. That
    // is this file's fault and it should arrive looking like it.
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`${new URL(url).host} returned HTTP ${response.status}`);
    // Carried rather than left in the sentence: one caller below tells "come
    // back in a moment" apart from "no", and reading that out of a message is
    // not something a caller should be doing.
    error.status = response.status;
    throw error;
  }
  return response.text();
}

async function getJson(url, options) {
  // Some of these services answer a request they dislike with a plain-text
  // apology under a 200, so the body is parsed by hand rather than by
  // response.json() — which would report a syntax error and hide the reason.
  const text = await getText(url, "application/json", options);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${new URL(url).host} returned a non-JSON body`);
  }
}

/* ------------------------------------------------------------------ place -- */

const PLACE_LANGUAGE = { en: "en", zh: "zh", ja: "ja", fr: "fr", es: "es", de: "de" };

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
      // ISO-3166-2, e.g. "JP-26" — the form Google Trends files its subregional
      // lists under, which is what lets the trends card be prefecture-level
      subdivisionCode: firstString(data.principalSubdivisionCode),
    };
  });
}

// The one line a spot is filed under — as much of district, city and region as
// the geocoder knows, narrowest first. Null where it knew none of it, which is
// the sea and not much else.
//
// A post's line and only a post's. A mark used to be filed the same way, in all
// three languages at once, and is not any more: what the reader kept is a spot,
// and a district's name is not that spot's name (see the marks endpoint). A post
// is the other case — it is left for whoever comes past, and where it was left
// is part of reading it.
export function placeLine(place) {
  return (place ? [place.locality, place.name, place.region].filter(Boolean).join(" · ") : "") || null;
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
    // The hours themselves, for the other face of the weather tile. Three
    // readings and no more: what it will be, how warm, and how likely it is to
    // rain — which is the whole of what an hourly forecast is asked.
    url.searchParams.set("hourly", "weather_code,temperature_2m,precipitation_probability");
    // timezone=auto is what makes the clock card local rather than the visitor's:
    // the response carries the IANA zone of the coordinates themselves.
    url.searchParams.set("timezone", "auto");
    // Today plus the three days the weather tile stands in its corner. Asking
    // for more is free at this end but nothing reads it, and a fourth row would
    // not fit beside the temperature anyway.
    url.searchParams.set("forecast_days", "4");
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

    // Open-Meteo answers the hourly readings a whole forecast day at a time,
    // midnight to midnight, so the run opens hours behind the reading rather
    // than ahead of it. What the card's other face is for is the hours still to
    // come, so it starts at the hour the reading itself falls in.
    //
    // Sliced rather than parsed, for the reason the clock slices sunrise: these
    // are the location's own wall clock, and Date would read them back as the
    // visitor's (see ClockCard). Which also makes the comparison below a
    // string one — the times are fixed-width and written largest part first, so
    // later reads as greater.
    const hourly = data.hourly ?? {};
    const times = hourly.time ?? [];
    // A reading with no time to it leaves nothing to start from; the day itself
    // is then the honest answer, and the browser drops whatever is behind it.
    const start = Math.max(0, times.findIndex((time) => time >= `${(current.time ?? "").slice(0, 13)}:00`));
    const hours = times.slice(start, start + HOURLY_HOURS).map((time, index) => ({
      time,
      weatherCode: hourly.weather_code?.[start + index] ?? null,
      temperature: hourly.temperature_2m?.[start + index] ?? null,
      // Per cent, and null where the model has nothing to say rather than zero:
      // "no chance of rain" and "not asked" are different answers.
      rain: hourly.precipitation_probability?.[start + index] ?? null,
    }));

    return {
      timezone: {
        id: data.timezone ?? "UTC",
        abbreviation: data.timezone_abbreviation ?? "",
        offsetSeconds: data.utc_offset_seconds ?? 0,
      },
      // The height of the ground the forecast was made for, which comes back
      // with every answer whether anyone asked or not. Passed along because a
      // phone's own altitude is a reading only a GPS can give and most fixes
      // have none: this is the terrain of a model cell kilometres wide, right
      // about the valley and silent about the building, and the compass card
      // says as much when it falls back to it.
      elevation: Number.isFinite(data.elevation) ? data.elevation : null,
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
      hours,
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
const NEWS_LANGUAGE = {
  en: { hl: "en-US", ceid: "en" },
  zh: { hl: "zh-CN", ceid: "zh-Hans" },
  ja: { hl: "ja", ceid: "ja" },
  fr: { hl: "fr", ceid: "fr" },
  es: { hl: "es", ceid: "es" },
  de: { hl: "de", ceid: "de" },
};

function countryFor(countryCode) {
  return /^[A-Za-z]{2}$/.test(countryCode ?? "") ? countryCode.toUpperCase() : "US";
}

// The reader's own language, where an edition for it exists.
function readerLocale(lang, countryCode) {
  const { hl, ceid } = NEWS_LANGUAGE[lang] ?? NEWS_LANGUAGE.en;
  const gl = countryFor(countryCode);
  return `hl=${hl}&gl=${gl}&ceid=${gl}:${ceid}`;
}

// The place's own edition, whatever language that turns out to be — the only
// form that reliably has a section for somewhere like Kyoto, which the English
// edition of Google News does not carry at all. Local news in the local language
// beats worldwide chatter that merely mentions the city's name.
//
// Null where the country has no edition of its own, which is most of them.
// gl=ER is not refused, it is answered with the American edition, so asking
// anyway would repeat the reader's attempt above under a local-looking name and
// spend a round trip doing it.
function nativeLocale(countryCode) {
  const edition = newsEdition(countryCode);
  return edition ? `hl=${edition.hl}&gl=${edition.gl}&ceid=${edition.ceid}` : null;
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

// A section Google will not serve is refused as a feed containing one item that
// says so — "This feed is not available." — under a link back to its own front
// page rather than to an article. It arrives as a 200 with an <item> in it, so
// without this the attempt below counts as an answer, the chain stops on it, and
// the news card shows Google's apology as though it were the local headlines.
// The wording is in the reader's language and the link is not, which is what
// makes the link the thing to test.
function isArticle(url) {
  try {
    const { hostname, pathname } = new URL(url);
    return !(hostname === "news.google.com" && pathname === "/");
  } catch {
    return false;
  }
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
    .filter((item) => item.title && item.url && isArticle(item.url));
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
      ...(native ? names.map((name) => geoSectionUrl(name, native)) : []),
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
const EVENT_TERMS =
  "(イベント OR events OR 活动 OR 祭 OR événement OR événements OR evento OR eventos OR Veranstaltung OR Veranstaltungen)";
// An event is stale the moment it is over, so the listing only looks back a
// fortnight — long enough to catch a run that is still going.
const EVENT_WINDOW = "when:14d";
// The second attempt's, where a fortnight came back empty. Wider because the
// second attempt is not asking a better-phrased version of the first question:
// it is asking a thinner press, and a fortnight of a thin press is nothing.
const EVENT_WINDOW_WIDE = "when:30d";
const EVENTS_TTL_MS = 30 * 60 * 1000;
// Nothing found is worth asking again about soon; a full answer keeps.
const EVENTS_EMPTY_TTL_MS = 5 * 60 * 1000;
const MAX_EVENT_ITEMS = 12;

// City level, not ward level: a ward has its own news, but its events get
// written up under the name of the city they are in.
async function fetchEventNews(place, locale, window) {
  for (const name of [place?.name, place?.region].filter(Boolean)) {
    const batch = await fetchNewsFeed(searchUrl(`${name} ${EVENT_TERMS} ${window}`, locale)).catch(() => []);
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
    const reader = readerLocale(language, place?.countryCode);
    let items = await fetchEventNews(place, reader, EVENT_WINDOW);

    // Nothing on in the reader's own language — which for a reader abroad is the
    // ordinary answer rather than a rare one, and says nothing at all about
    // whether anything is on. So ask a second time the way the news card does:
    // the place's own edition, under the name that edition's papers write it in.
    //
    // Both halves are doing work. Google indexes a name as it is written and does
    // not fold 倫敦 into 伦敦, while the geocoder hands back whichever of the two
    // it happens to hold — so the reader's name for a place cannot be trusted to
    // be the one the press searched under. And the window is the other half: a
    // fortnight of Chinese writing about what is on in London is genuinely empty
    // where a month of it is not.
    //
    // The answer comes back in the local language, which is the bargain struck
    // for the news card above and the same one here — what is on, written up
    // where it is happening, beats an empty panel in a language you read.
    if (items.length === 0) {
      const native = nativeLocale(place?.countryCode);
      // Where the country runs no edition of its own the reader's is already the
      // one Google would answer with, so only the window widens.
      const localPlace = native
        ? await lookupPlace(latitude, longitude, wikiEdition(place.countryCode)).catch(() => place)
        : place;
      items = await fetchEventNews(localPlace, native ?? reader, EVENT_WINDOW_WIDE);
    }

    // The reader's own name for where they are standing, whichever edition
    // ended up answering: the card puts it in the heading, not in a row.
    return { place, items: dedupe(items).slice(0, MAX_EVENT_ITEMS) };
  });
}

/* ----------------------------------------------------------------- venues -- */

// Somewhere to eat, and somewhere for a coffee — off OpenStreetMap by way of
// Overpass. The only upstream in this file that is asked a question rather than
// handed an address, and the question is worth reading:
//
//   [out:json][timeout:20];
//   nwr[amenity=cafe][name](around:1500,35.01,135.77);
//   out tags center;
//
// `nwr` is node, way and relation at once, because the same café is a dropped
// pin in one town and a traced building outline in the next — a list that held
// only the pins would be a different list per town, for reasons that are about
// who mapped the street rather than about what is on it. `out center` makes
// those two answer alike: an outline comes back with a computed middle instead
// of a position of its own. `tags` is what keeps the outline itself out of the
// answer, which is a few hundred node ids lo has no use for.
//
// `[name]` is the one editorial line in it. An amenity nobody has named is a row
// reading "Restaurant · 240 m", which is a pin on somebody's map rather than a
// place to go and eat.
//
// These are also the only two cards answered the same way everywhere: OSM stops
// at no border, so unlike the three Google feeds there is nothing to write down
// in countries.js about where they work.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Overpass will not talk to the User-Agent the rest of this file uses: anything
// opening `Mozilla/5.0 (compatible;` is turned away with a 406 before the query
// is read at all. It is a public instance on donated hardware and it asks
// callers to say plainly who they are, which is fair — so here lo does.
const OVERPASS_AGENT = "lo/0.1 (location dashboard)";
// Longer than the eight seconds a feed gets: a city centre is a few hundred rows
// and several seconds of somebody else's CPU, and a busy instance queues the
// query before it starts on it. The first figure is the budget Overpass is asked
// to hold itself to, and the second is set above it so that work lo has already
// asked for is never abandoned a moment before it lands.
const OVERPASS_QUERY_TIMEOUT_S = 20;
const OVERPASS_TIMEOUT_MS = 22000;

// Overpass hands each caller two query slots and answers a request that arrives
// without one with a 429. Two cards on the dashboard asking at once is that
// whole allowance, the widening below can spend it twice in a row, and a slot
// stays warm for a moment after the query that held it has answered — so lo
// queues its own queries rather than finding the ceiling by hitting it. One at a
// time, a breath between them, and a single retry for the 429 that a slot still
// busy with somebody else's minute would produce anyway.
const OVERPASS_GAP_MS = 1000;
const OVERPASS_RETRY_MS = 3000;

let overpassTurn = Promise.resolve();
let overpassLastAt = 0;

function askOverpass(query) {
  const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`;
  const options = { agent: OVERPASS_AGENT, timeout: OVERPASS_TIMEOUT_MS };

  const turn = overpassTurn.then(async () => {
    const wait = overpassLastAt + OVERPASS_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await getJson(url, options);
    } catch (error) {
      if (error.status !== 429) throw error;
      await sleep(OVERPASS_RETRY_MS);
      return getJson(url, options);
    } finally {
      overpassLastAt = Date.now();
    }
  });

  // The queue is a line of turns and not a chain of results: whatever this one
  // did, the next has to be let through, so what the line waits on is a promise
  // that cannot reject.
  overpassTurn = turn.then(
    () => {},
    () => {},
  );
  return turn;
}

// The two cards, as the tags OSM files each of them under. Two questions rather
// than one list with a filter over it: "where can I eat" and "where can I sit
// down with a coffee" are asked at different hours and answered by different
// streets, and a reader who wants one of them on the dashboard need not carry
// the other (see utils/cards.js).
const VENUE_TAGS = {
  food: 'amenity~"^(restaurant|fast_food|food_court)$"',
  cafe: "amenity=cafe",
};

// A walk first, and the surrounding country only if the walk turned up nothing.
// The second ring is never paid for in a town; it is there for the places where
// the nearest café is the next village along, and where an empty card would be
// the wrong answer to a question that has one.
const VENUE_RADII_M = [1500, 6000];
const MAX_VENUES = 24;

// A restaurant is not news: tomorrow's list is today's list, and the only thing
// that makes it worth asking again is the reader having walked somewhere. So an
// answer keeps for an hour, filed under a ~1 km square of ground.
//
// That square is also why the near ring is 1500 m rather than the 800 m a walk
// would suggest. Rounding onto it leaves the reader as much as ~800 m from the
// point the circle was drawn around, and the radius has to cover that slack
// before it covers any walking — otherwise the nearest place, if it happens to
// lie behind them, is missing from a list whose whole claim is that it is
// sorted by how near things are.
const VENUE_TTL_MS = 60 * 60 * 1000;
const VENUE_EMPTY_TTL_MS = 10 * 60 * 1000;
const VENUE_GRID = 2;

const EARTH_RADIUS_M = 6_371_008.8;

// How far apart two fixes are, in metres. The browser works this out too (see
// utils/format.js); the two are separate copies because there is no module both
// sides import, and they are the same formula over the same radius on purpose —
// "how far is that" must not have two answers in one app.
function metresBetween(from, to) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const lat1 = rad(from.latitude);
  const lat2 = rad(to.latitude);
  const dLat = lat2 - lat1;
  const dLon = rad(to.longitude - from.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// OSM keeps the reader's language beside the local one — name:en, name:ja,
// cuisine:ja — and the reader's is preferred here, with the name on the sign
// outside as the fallback. That is the right way round even for somewhere you
// are being sent to walk to: a name you cannot read is not a name, and the
// mappers who filled in name:en did it for exactly this.
function localizedTag(tags, key, language) {
  return firstString(tags[`${key}:${language}`], tags[key]);
}

// Cuisine is written as a semicolon list of slugs — `chinese;gyoza`, `beef_bowl`
// — and one word is all a row has room for. The vocabulary is open, so there is
// nothing to translate it against: it is handed on as it arrived, and the card
// tidies the underscores.
function firstCuisine(tags, language) {
  return firstString(localizedTag(tags, "cuisine", language).split(";")[0]);
}

async function fetchVenues(kind, latitude, longitude, radius, language) {
  const query =
    `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_S}];` +
    `nwr[${VENUE_TAGS[kind]}][name](around:${radius},${latitude},${longitude});` +
    `out tags center;`;
  const data = await askOverpass(query);

  return (data.elements ?? [])
    .map((element) => {
      const tags = element.tags ?? {};
      // A node stands where it stands; a way or a relation carries the middle of
      // whatever was traced, which `out center` worked out for it.
      const at = element.type === "node" ? element : element.center;
      const name = localizedTag(tags, "name", language);
      if (!at || !name) return null;
      return {
        // Kind and number together: OSM numbers nodes, ways and relations from
        // one apiece, so node 1 and way 1 are two different things.
        id: `${element.type}/${element.id}`,
        name,
        // The amenity itself, which the card has its own word for — a fast food
        // counter and a restaurant are a different evening.
        category: firstString(tags.amenity),
        cuisine: firstCuisine(tags, language),
        latitude: at.lat,
        longitude: at.lon,
      };
    })
    .filter(Boolean);
}

// Both cards, told apart by which amenities they ask about.
//
// What is cached is the list around the middle of the square; how far each row
// is from the reader is worked out afterwards, per request, from the fix they
// actually sent. Distance is the one thing on these rows the rounding would
// visibly get wrong — a café forty metres away shown as six hundred is not a
// rounding error to somebody standing outside it — and being right about it
// costs no upstream call.
export function lookupVenues(kind, latitude, longitude, lang = "en") {
  const language = PLACE_LANGUAGE[lang] ?? "en";
  const key = `venues:${kind}:${language}:${gridKey(latitude, longitude, VENUE_GRID)}`;
  const ttl = (value) => (value.items.length === 0 ? VENUE_EMPTY_TTL_MS : VENUE_TTL_MS);

  return cached(key, ttl, async () => {
    const centre = gridCentre(latitude, longitude, VENUE_GRID);
    const place = await lookupPlace(latitude, longitude, language).catch(() => null);
    for (const radius of VENUE_RADII_M) {
      const items = await fetchVenues(kind, centre.latitude, centre.longitude, radius, language);
      if (items.length > 0) return { place, radius, items };
    }
    // Nothing in either ring, and the card should say so about the wider one:
    // "nothing within six kilometres" is the claim that was actually checked.
    return { place, radius: VENUE_RADII_M.at(-1), items: [] };
  }).then(({ place, radius, items }) => ({
    place,
    radius,
    items: items
      .map((item) => ({ ...item, distance: Math.round(metresBetween({ latitude, longitude }, item)) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_VENUES),
  }));
}

/* --------------------------------------------------------------- wikipedia -- */

// Every Wikipedia article that carries a coordinate near here, with its lead
// paragraph and a picture where it has one — the nearby-articles card and its
// own pins on the map, as distinct a question from `fetchWikipediaNearby`
// above as the same encyclopaedia can be asked twice: that one wants a bare
// list of titles for the news card to link away to when the newswire has
// nothing, and this wants enough to read without leaving lo at all. Two
// different shapes of the same upstream, not one forced to answer both.
//
// A wider net than the walk food and cafés get: an article about the shrine on
// the hill is still worth surfacing a couple of kilometres off in a way a
// coffee is not, so the near ring here is wider and the far one wider still.
//
// Wider in the other direction as well — several editions of the encyclopaedia
// rather than the reader's own, merged back into one list by subject. See
// wikiLanguages below for why.
const WIKI_RADII_M = [2000, 10000];
const MAX_WIKI_PLACES = 24;
// As much of the lead as the card and the map's own popup have room for — long
// enough to say what the place is, short enough that a popup on a map does not
// turn into a reading surface.
const WIKI_EXTRACT_CHARS = 280;
// An article does not move and its lead paragraph does not change by the hour,
// so this keeps the same shape the venue answers do: a square of ground, kept
// for as long as a walk across it stays the same list.
const WIKI_TTL_MS = 60 * 60 * 1000;
const WIKI_EMPTY_TTL_MS = 10 * 60 * 1000;
const WIKI_GRID = 2;
// Wikimedia renders a thumbnail at a fixed list of widths and turns away a
// request for any other with a 400 — 20, 40, 60, 120, 250, 330, 500, 960, 1280
// and up. Both of the numbers below are off that list, and neither is a size
// somebody liked the look of.
//
// The big one is what a reader presses the picture to see (see ui/Lightbox);
// the small one is for the boxes that show a picture at a glance rather than to
// be looked at — the stamp under a pin on the map and the 32px square on a row
// in the card. 120 rather than 60 because both of those are drawn on screens
// that put two or three pixels in every one of theirs, and it costs about 6 kB.
const WIKI_THUMB = 1280;
const WIKI_THUMB_SMALL = 120;

// Wikimedia writes the width it rendered a thumbnail at into the file name and
// serves the other listed widths off the same path, so the small copy is a
// string edit rather than a second question. The path only — the answer now
// arrives with a query string on it, and the width is not in that.
//
// Two shapes to edit, because pageimages answers in two. Most pictures come back
// as a rendering — .../thumb/c/ca/Name.jpg/1280px-Name.jpg — where the width is
// in the name and the small copy is that number changed. A picture whose
// original was already narrower than the size asked for comes back as the
// original itself — .../commons/c/ca/Name.jpg, no thumb and no width — and the
// original of "narrower than 1280" is still a hundred and thirty kilobytes of
// map. That one is turned into a rendering, which is the path above built by
// hand: the same two hash segments, under /thumb/, with the size on the end.
//
// Only for the picture formats that are stored as pictures. An SVG's rendering
// is a PNG and its name gains an extension along the way, which is a rule this
// has no business knowing — and it never has to, since a drawing is always
// answered as a rendering and never as itself.
const RASTER = /\.(jpe?g|png|gif|webp)$/i;

function smallThumbnail(url) {
  if (!url) return null;
  try {
    const small = new URL(url);
    const segments = small.pathname.split("/");
    if (segments.includes("thumb")) {
      small.pathname = small.pathname.replace(/\/(\d+)px-([^/]*)$/, `/${WIKI_THUMB_SMALL}px-$2`);
    } else if (segments.length === 6 && RASTER.test(segments[5])) {
      const [, wiki, project, hash, pair, file] = segments;
      small.pathname = `/${wiki}/${project}/thumb/${hash}/${pair}/${file}/${WIKI_THUMB_SMALL}px-${file}`;
    }
    return small.href;
  } catch {
    return url;
  }
}

// Which editions to search, in the order a reader would rather read them. All of
// them, and not the one the interface happens to be in: an article about the
// shrine at the end of the street is worth having in a language you do not read
// — you are standing in front of the thing it is about — and refusing it because
// nobody has written the Chinese version is how a card in Kyoto comes back
// empty.
//
// The interface language first all the same. Where its edition both has the
// article and knows where the place is, that is the row, and inReadersLanguage
// below has nothing left to do for it. Then English, the widest net there is,
// and then the ground's own, which is the one that actually carries the small
// local places (see wikiEdition in countries.js) — those two decide the language
// only of the rows that are in neither of the first two, and their real work is
// finding the landmark at all.
function wikiLanguages(lang, countryCode) {
  const wanted = [lang, "en", wikiEdition(countryCode)];
  return wanted.filter((value, index) => value && wanted.indexOf(value) === index);
}

// The same question put to several editions at once, answered as one list — and
// then that list put back into the reader's language wherever it can be (see
// inReadersLanguage below). As many landmarks as there are, each in as near the
// reader's own words as exists: the two halves of that are asked separately
// because they are separate questions.
//
// An edition that is down or slow to answer is skipped rather than allowed to
// take the others with it: two encyclopaedias' worth of a neighbourhood is a
// better answer than none, and which edition a row came out of is a thing the
// card says on the way in to the article rather than a condition of showing it.
//
// Skipped, though — not counted as an edition that looked and found nothing.
// Those two are the same empty list and they mean opposite things, and the
// caller does something irreversible with the difference: an empty answer is
// cached, so a minute of Wikimedia refusing everyone would otherwise be written
// down as "there is nothing around here" and served for the next ten (see
// WIKI_EMPTY_TTL_MS). So all of them failing is a failure, and it is thrown.
async function fetchWikipediaPlaces(latitude, longitude, radius, languages) {
  const answers = await Promise.allSettled(
    languages.map((lang) => fetchWikipediaEdition(latitude, longitude, radius, lang)),
  );
  for (const answer of answers) {
    // A refusal from one edition is worth a line even though the request
    // survives it: without one, a card that came back short has no explanation
    // anywhere. `unreachable` writes the same line for the failures that are the
    // network's rather than the API's.
    if (answer.status === "rejected") console.warn(`upstream: ${answer.reason?.message ?? answer.reason}`);
  }
  const editions = answers.filter((answer) => answer.status === "fulfilled").map((answer) => answer.value);
  if (editions.length === 0) throw answers[0].reason;
  // One landmark, however many editions have written about it. Wikidata is what
  // says so: every edition's article about the same subject carries the same Q
  // number, which is the only honest way to tell "Kinkaku-ji" and "金閣寺" are
  // one place. The first edition to answer for a subject keeps it, and the order
  // they were asked in above is the order of preference.
  const found = new Map();
  for (const items of editions) {
    for (const item of items) {
      if (!found.has(item.subject)) found.set(item.subject, item);
    }
  }
  return inReadersLanguage([...found.values()], languages[0]);
}

// The two limits are the same number and it is the API's: fifty subjects to a
// question of Wikidata, fifty titles to a question of Wikipedia.
const WIKI_BATCH = 50;

function batches(values, size) {
  const groups = [];
  for (let at = 0; at < values.length; at += size) groups.push(values.slice(at, at + size));
  return groups;
}

// Which article the reader's own edition has for each of these subjects, where
// it has one at all. Asked of Wikidata rather than of the editions the rows came
// out of: a Q number's sitelinks are the whole list of encyclopaedias that have
// written about that subject, so one question covers rows from any number of
// them, and `sitefilter` cuts the answer down to the single edition being asked
// about instead of the three hundred that exist.
async function wikiTitlesIn(lang, subjects) {
  const titles = new Map();
  for (const group of batches(subjects, WIKI_BATCH)) {
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.searchParams.set("action", "wbgetentities");
    url.searchParams.set("ids", group.join("|"));
    url.searchParams.set("props", "sitelinks");
    url.searchParams.set("sitefilter", `${lang}wiki`);
    url.searchParams.set("format", "json");
    const data = await getJson(url.href);
    for (const [subject, entity] of Object.entries(data.entities ?? {})) {
      const title = firstString(entity.sitelinks?.[`${lang}wiki`]?.title);
      if (title) titles.set(subject, title);
    }
  }
  return titles;
}

// And those articles themselves, read out of the reader's edition. Keyed by
// subject on the way back rather than by the title they were asked for, which
// saves following the API's own trail of normalisations and redirects from what
// was asked to what answered: every page carries its own Q number, and that is
// the thing being matched anyway.
async function wikiArticlesIn(lang, titles) {
  const articles = new Map();
  for (const group of batches(titles, WIKI_BATCH)) {
    const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    url.searchParams.set("action", "query");
    url.searchParams.set("titles", group.join("|"));
    url.searchParams.set("redirects", "1");
    wikiContentParams(url.searchParams);
    const data = await getJson(url.href);
    for (const page of Object.values(data.query?.pages ?? {})) {
      if (page.missing !== undefined || !page.pageid) continue;
      const subject = firstString(page.pageprops?.wikibase_item);
      if (subject) articles.set(subject, writtenBy(page, lang));
    }
  }
  return articles;
}

// The other half of asking three encyclopaedias at once. The merge above is
// about how *many* landmarks come back; this is about which language each one
// comes back in, and the two are separate questions with separate answers.
//
// The reason they have to be is that a coordinate is a fact about an article and
// not about a place: zh.wikipedia has a page on the shrine at the end of the
// street and no {{coord}} template on it, so a search of that edition by
// position walks straight past it, and the row is found by ja or en instead. The
// reader is then handed Japanese for a landmark that has been written up in
// their own language all along — which is the first thing they will notice and
// the last thing lo should be defending.
//
// So: the ground is searched in every edition, and then every row that came back
// in a foreign one is asked for again by name in the reader's. Two more round
// trips behind an hour's cache, and only where there is something to fix — a
// reader whose language is the only edition asked never gets here at all.
//
// Whole rows, not just their titles. A native title over a foreign lead
// paragraph would be worse than either done properly, and the page in the
// reader's edition has its own picture, its own id and its own address. What
// survives from the row it replaces is what the reader's edition was never asked
// for and does not know: which subject this is, and where on the ground it
// stands.
//
// Failure at either step leaves the list exactly as the merge made it, and is
// swallowed rather than thrown for exactly the reason the merge's own failures
// are not: a card in three languages is a smaller wrong than no card, where an
// empty one would have been a claim about the neighbourhood.
async function inReadersLanguage(items, lang) {
  const foreign = items.filter((item) => item.lang !== lang && /^Q\d+$/.test(item.subject));
  if (foreign.length === 0) return items;

  const shrug = (error) => {
    console.warn(`upstream: ${error.message}`);
    return new Map();
  };
  const titles = await wikiTitlesIn(
    lang,
    foreign.map((item) => item.subject),
  ).catch(shrug);
  if (titles.size === 0) return items;

  const articles = await wikiArticlesIn(lang, [...titles.values()]).catch(shrug);
  return items.map((item) => {
    const article = articles.get(item.subject);
    if (!article) return item;
    // The reader's article laid over the row that found the place — except for
    // the picture, where their edition has none and the row does. A photograph
    // of a shrine is not written in any language, and the editions differ about
    // which articles carry one as much as they differ about anything: the
    // Japanese page on a Kyoto temple has the infobox photograph and the Chinese
    // page on the same temple often does not. Taking the blank would be losing a
    // picture lo already had in hand to gain a title.
    const picture = article.thumbnail ? article : item;
    return {
      ...item,
      ...article,
      thumbnail: picture.thumbnail,
      thumbnailSmall: picture.thumbnailSmall,
      thumbnailWidth: picture.thumbnailWidth,
      thumbnailHeight: picture.thumbnailHeight,
    };
  });
}

// Where an article is read, from the two things that say which one it is.
function articleUrl(lang, title) {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, "_"))}`;
}

// The four fields a picture arrives as, out of the one MediaWiki answers with.
// Both queries below want them and neither wants to write them out again.
function pictureFields(thumbnail) {
  return {
    thumbnail: thumbnail?.source ?? null,
    // The same picture at a size the small boxes actually draw: a stamp under a
    // pin and a 32px square on a row would otherwise both be downscaling the
    // 1280px copy asked for below, which is half a megabyte of map nobody looks
    // at.
    thumbnailSmall: smallThumbnail(thumbnail?.source ?? null),
    // The shape Wikimedia rendered it at, which lo has no business guessing at:
    // the Lightbox this feeds sizes its box from these two numbers exactly as
    // it does for a post's own photo.
    thumbnailWidth: thumbnail?.width ?? null,
    thumbnailHeight: thumbnail?.height ?? null,
  };
}

// What lo wants to know about an article once it has decided it wants it: the
// lead, the picture, where it stands, and the Wikidata number that says which
// subject it is about. Written once because it is asked twice — of the articles
// geosearch finds, and of the same articles again in the reader's own edition
// below, which is asked for the coordinate too though it is rarely the reason
// the second question is being put (see inReadersLanguage).
//
// pageprops is here for that one field. Asked for by name rather than
// wholesale: a page's properties are a long list and this wants one of them.
function wikiContentParams(params) {
  params.set("prop", "extracts|pageimages|coordinates|pageprops");
  params.set("ppprop", "wikibase_item");
  params.set("exintro", "1");
  params.set("explaintext", "1");
  params.set("exchars", String(WIKI_EXTRACT_CHARS));
  params.set("piprop", "thumbnail");
  // Big enough to be the picture a reader presses to see properly (see
  // ui/Lightbox), not just the crop a preview card shows. One size *asked* for,
  // where lo's own pictures are stored as two: this is Wikimedia's CDN and not a
  // file lo pays to keep, and it serves every width off the same path — so the
  // small copy the map and the rows draw is a string edit on the answer rather
  // than a second question (see smallThumbnail above).
  params.set("pithumbsize", String(WIKI_THUMB));
  params.set("format", "json");
}

async function fetchWikipediaEdition(latitude, longitude, radius, lang) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  // Geosearch as a generator rather than a list (contrast fetchWikipediaNearby
  // above): a generator hands its results on to `prop` to be filled in, which
  // is what gets the extract and the thumbnail in the same round trip instead
  // of one lookup per place.
  url.searchParams.set("generator", "geosearch");
  url.searchParams.set("ggscoord", `${latitude}|${longitude}`);
  url.searchParams.set("ggsradius", String(radius));
  url.searchParams.set("ggslimit", "20");
  wikiContentParams(url.searchParams);
  const data = await getJson(url.href);
  // Answered as an object keyed by page id rather than as a list — geosearch's
  // own ordering is not carried over, which is why the caller sorts by the
  // real distance from the reader rather than trusting the order here.
  const pages = Object.values(data.query?.pages ?? {});
  return pages
    .map((page) => {
      const at = page.coordinates?.[0];
      if (!at) return null;
      return {
        // What the article is *about*, which is not the same as which article
        // it is: the merge above is by subject, and two editions writing about
        // one place agree on this and on nothing else. Falls back to the page's
        // own identity where Wikidata has no item for it, which merges nothing
        // — the safe direction, since showing a place twice is a smaller wrong
        // than folding two places into one.
        subject: firstString(page.pageprops?.wikibase_item) || `${lang}/${page.pageid}`,
        latitude: at.lat,
        longitude: at.lon,
        ...writtenBy(page, lang),
      };
    })
    .filter(Boolean);
}

// Everything about a row that belongs to the edition it was read out of, kept
// together because it is replaced together: a row rewritten in the reader's own
// language below changes all of this at once, and its subject and its place on
// the ground not at all.
function writtenBy(page, lang) {
  return {
    // Namespaced the way an OSM venue's id is, so a card publishing this list to
    // the map's shared store cannot collide with one keyed by a plain page id
    // that happens to match a node's.
    id: `wikipedia/${page.pageid}`,
    title: String(page.title),
    description: firstString(page.extract),
    // Which encyclopaedia this row came out of. Worth carrying now that a list
    // can hold three of them: it is what the way through to the article is
    // labelled with, and the one honest warning that a row is about to be read
    // in a language the reader did not ask for.
    lang,
    source: `${lang}.wikipedia.org`,
    url: articleUrl(lang, page.title),
    ...pictureFields(page.thumbnail ?? null),
  };
}

// A walk first, and the wider ring only where nothing carries a coordinate
// within it — the same two-ring shape lookupVenues uses, for the same reason:
// paying for the wider search on every request would be answering a question
// nobody asked most of the time.
export function lookupWikipedia(latitude, longitude, lang = "en") {
  const language = PLACE_LANGUAGE[lang] ?? "en";
  const key = `wikipedia:${language}:${gridKey(latitude, longitude, WIKI_GRID)}`;
  const ttl = (value) => (value.items.length === 0 ? WIKI_EMPTY_TTL_MS : WIKI_TTL_MS);

  return cached(key, ttl, async () => {
    const centre = gridCentre(latitude, longitude, WIKI_GRID);
    const place = await lookupPlace(latitude, longitude, language).catch(() => null);
    // Which editions get asked depends on the country, which is only known once
    // the place above has landed — and the key does not have to say so: a grid
    // square is in one country, so the reader's language settles the whole list
    // for it. The same key, the same three editions, the same answer.
    const languages = wikiLanguages(language, place?.countryCode);
    for (const radius of WIKI_RADII_M) {
      const items = await fetchWikipediaPlaces(centre.latitude, centre.longitude, radius, languages);
      if (items.length > 0) return { place, radius, items };
    }
    return { place, radius: WIKI_RADII_M.at(-1), items: [] };
  }).then(({ place, radius, items }) => ({
    place,
    radius,
    items: items
      .map((item) => ({ ...item, distance: Math.round(metresBetween({ latitude, longitude }, item)) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_WIKI_PLACES),
  }));
}

/* ----------------------------------------------------------------- trends -- */

// What the place is searching for. Google files these by ISO-3166-2 subregion
// wherever it has the volume to — JP-13 and JP-26 come back as genuinely
// different lists — so the answer can be prefecture- or state-level rather than
// the metro-or-nothing X could offer, and it costs nothing, which makes the TTL
// below a freshness dial rather than a bill.
const TRENDS_HOST = "https://trends.google.com/trending/rss";
const TRENDS_TTL_MS = 30 * 60 * 1000;
// Nothing came back — either a region Google does not cover or a bad minute on
// the wire. Worth asking again about sooner than a full answer.
const TRENDS_EMPTY_TTL_MS = 10 * 60 * 1000;
const MAX_TRENDS = 20;

// Google answers for a country or one of its subregions and rejects anything
// else outright with a 400 — it never quietly serves somewhere else's list, so
// unlike the WOEID table this replaced, asking for the narrow code first and
// falling back to the country is safe to do blind.
//
// Which countries it covers at all is not blind, though: half of them it does
// not, and countries.js has the list. A country that is not on it has no covered
// subregions either, so the whole climb down is skipped rather than paid for in
// 400s — geo=CN is a rejection at every level, and the card says it has nothing
// rather than showing the world's.
function trendScopes(place) {
  const country = firstString(place?.countryCode).toUpperCase();
  if (!supports("trends", country)) return [];

  const subdivision = firstString(place?.subdivisionCode).toUpperCase();
  const scopes = [];

  if (/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(subdivision) && subdivision.startsWith(`${country}-`)) {
    // principalSubdivision is blanked out in lookupPlace when it repeats the
    // city name, which is exactly what happens in a city-prefecture like Kyoto.
    scopes.push({ geo: subdivision, name: firstString(place?.region, place?.name), scope: "region" });
  }
  if (/^[A-Z]{2}$/.test(country)) {
    scopes.push({ geo: country, name: firstString(place?.country), scope: "country" });
  }
  return scopes;
}

async function fetchTrendFeed(geo) {
  const xml = await getText(`${TRENDS_HOST}?geo=${encodeURIComponent(geo)}`, "application/rss+xml, application/xml");
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => {
      const name = tagContent(item, "title");
      // "200+", always rounded down to a power-of-ten-ish floor. The digits are
      // the only part worth keeping; the card puts the + back on itself.
      const traffic = Number.parseInt(tagContent(item, "ht:approx_traffic").replace(/[^\d]/g, ""), 10);
      // A search word on its own rarely says why it is spiking, so the feed's
      // top related story rides along and becomes the row's destination — the
      // <link> element is no use, it just points back at the feed.
      const story = tagContent(item, "ht:news_item_url");
      return {
        name,
        count: Number.isFinite(traffic) ? traffic : null,
        headline: tagContent(item, "ht:news_item_title"),
        source: tagContent(item, "ht:news_item_source"),
        url: story || `https://www.google.com/search?q=${encodeURIComponent(name)}`,
      };
    })
    .filter((trend) => trend.name);
}

export function lookupTrends(latitude, longitude, lang = "en") {
  const language = PLACE_LANGUAGE[lang] ?? "en";
  // A region Google does not cover 400s every time, not once, so the empty list
  // is cached rather than thrown — otherwise every view of the card would pay
  // for the same rejection before falling back to the country.
  const ttl = (items) => (items.length === 0 ? TRENDS_EMPTY_TTL_MS : TRENDS_TTL_MS);

  return cached(`trends-where:${language}:${gridKey(latitude, longitude, PLACE_GRID)}`, PLACE_TTL_MS, () =>
    lookupPlace(latitude, longitude, language)
      .catch(() => null)
      .then(trendScopes),
  ).then(async (scopes) => {
    for (const where of scopes) {
      // Keyed on the geo code alone: everyone in the prefecture is asking the
      // same question, and the answer is in the language of the place either
      // way — only the label around it is the reader's.
      const items = await cached(`trends:${where.geo}`, ttl, () => fetchTrendFeed(where.geo).catch(() => []));
      if (items.length > 0) return { ...where, items: items.slice(0, MAX_TRENDS) };
    }
    return { items: [] };
  });
}

/* --------------------------------------------------------------- warnings -- */

// What Yahoo! 防災速報 pushes when the weather turns: 特別警報, 警報, 注意報, per
// municipality. The app publishes no feed of its own, but the page its weather
// alerts are read off — Yahoo! 天気・災害's 警報・注意報 — hands over a whole
// prefecture, municipality by municipality, in one attribute of one element, so
// a fix costs one request rather than a walk down the country's 1,700 pages.
//
// Japan only — countries.js is where that is written down, beside the two feeds
// that stop at other borders. The answer says so outright rather than letting
// silence read as all clear.
const WARN_HOST = "https://typhoon.yahoo.co.jp/weather/jp/warn";
// A warning minutes old is still the warning; an hour old it may have been
// lifted, which is why this is the shortest TTL in the file.
const WARN_TTL_MS = 5 * 60 * 1000;

// One page per prefecture, keyed by its JIS number — except Hokkaido, which is
// too big for one and comes in four. 道央 leads: Sapporo and a third of the
// prefecture's people are in it, so most fixes match on the first page fetched.
const HOKKAIDO_PAGES = ["1b", "1a", "1c", "1d"];
const WARN_REGIONS = [
  { name: "北海道", prefectures: [1], pages: HOKKAIDO_PAGES },
  { name: "東北", prefectures: [2, 3, 5, 4, 6, 7] },
  { name: "関東", prefectures: [9, 8, 10, 11, 19, 13, 14, 12] },
  { name: "信越", prefectures: [15, 20] },
  { name: "北陸", prefectures: [17, 16, 18] },
  { name: "東海", prefectures: [21, 22, 24, 23] },
  { name: "近畿", prefectures: [27, 28, 26, 25, 29, 30] },
  { name: "中国", prefectures: [32, 31, 34, 33, 35] },
  { name: "四国", prefectures: [38, 37, 39, 36] },
  { name: "九州・沖縄", prefectures: [41, 40, 42, 44, 43, 45, 47, 46] },
];

// Yahoo files the bands in four lists — emgWarningList, urgentWarningList,
// warningList, advisoryList, in that order, which is the order the four capture
// groups of AREA_RE come out in. Worst first, everywhere below.
const WARN_SEVERITIES = ["emergency", "urgent", "warning", "advisory"];

const BALLOON_RE = /id="warnArea_balloon_value"[^>]*?\svalue="([^"]*)"/;
// The payload is a Java object graph printed by toString, which reads worse than
// it parses: no nesting inside a municipality's four lists, and every field of
// interest is a bare word up against a comma.
const AREA_RE =
  /WarnPointData\(code=(\d+), name=([^,]*), firstAreaCode=[^,]*, emgWarningList=\[([^\]]*)\], urgentWarningList=\[([^\]]*)\], warningList=\[([^\]]*)\], advisoryList=\[([^\]]*)\]\)/g;
const KIND_RE = /WarnKind\(code=[^,]*, name=([^,)]+)/g;

function parseWarnPage(html) {
  const balloon = BALLOON_RE.exec(html);
  if (!balloon) return null;
  const payload = decodeXml(balloon[1]);

  const areas = [];
  // One block per 一次細分区域 — 南部, 北部, 伊豆諸島北部 — each with a bulletin
  // time of its own, so the time travels with the municipalities it was issued
  // for rather than being claimed for the page as a whole.
  for (const block of payload.split("FirstArea(").slice(1)) {
    const issuedAt = /refTime=([^,)]+)/.exec(block)?.[1] ?? null;
    for (const area of block.matchAll(AREA_RE)) {
      const items = [];
      WARN_SEVERITIES.forEach((severity, index) => {
        for (const kind of area[3 + index].matchAll(KIND_RE)) {
          items.push({ severity, name: kind[1].trim() });
        }
      });
      areas.push({ code: area[1], name: area[2].trim(), issuedAt, items });
    }
  }
  return areas.length > 0 ? areas : null;
}

function fetchWarnPage(page) {
  return cached(`warn-page:${page}`, WARN_TTL_MS, async () => {
    const areas = parseWarnPage(await getText(`${WARN_HOST}/${page}/`, "text/html"));
    // A page that parsed to nothing is a page whose markup has moved. Throwing
    // rather than caching the emptiness is what lets the next reader find out —
    // and stops "we cannot read it" from being served as "nothing is happening".
    if (!areas) throw new Error("typhoon.yahoo.co.jp returned no warning table");
    return areas;
  });
}

// A warning says nothing about when it lifts — the JMA issues it and later
// cancels it, and neither the prefecture page nor the agency's own feed carries
// an end time. What the municipality's page does carry is 今後の推移: the next day
// and a half, in three-hour columns, one row per hazard, each cell shaded with
// the strength forecast for it. The run of cells at the warning's own strength is
// the closest thing to "from when, until when" that exists — a forecast window
// rather than a validity period, which is why the card labels it as the outlook.
const TIME_TABLE_RE = /<table class="warnDetail_timeTable">([\s\S]*?)<\/table>/;
const DAY_ROW_RE = /<tr class="warnDetail_timeTable_row-day">([\s\S]*?)<\/tr>/;
const HOUR_ROW_RE = /<tr class="warnDetail_timeTable_row-time">([\s\S]*?)<\/tr>/;
const HAZARD_ROW_RE = /<tr class="warnDetail_timeTable_row-hazard">([\s\S]*?)<\/tr>/g;
const HEAD_CELL_RE = /<th(?:\s+colspan="(\d+)")?[^>]*>([\s\S]*?)<\/th>/g;
const BODY_CELL_RE = /<td\s+class="([^"]*)"(?:\s+colspan="(\d+)")?/g;
const HAZARD_NAME_RE = /<em>([^<]*)<\/em>/;
// Every cell carries its strength in its class name. The four bands are the four
// severities; 通常 and 予報期間外 are the two ways of being no warning at all, and
// they are kept apart because a run that ends at the edge of the forecast has not
// been forecast to end. Anything else — the rainfall row, which is millimetres
// rather than a strength — reads as nothing.
const CELL_KINDS = {
  emgWarning: "emergency",
  urgentWarning: "urgent",
  warning: "warning",
  advisory: "advisory",
  normal: "normal",
  outside: "outside",
};
const CELL_KIND_RE = /warnDetail_timeTable_cell-(\w+)/;
const CELL_MS = 3 * 60 * 60 * 1000;
// Weakest last: strongest() folds a hazard split across rows — 陸上 and 海上 wind
// — into the one series a reader standing in the municipality is under.
const KIND_STRENGTH = [...WARN_SEVERITIES, "normal", "outside"];

// The 日付 and 時間 rows both lead with a label cell, which is not a column.
function headCells(row) {
  return [...row.matchAll(HEAD_CELL_RE)]
    .map((cell) => ({ span: Number(cell[1] ?? 1), text: cell[2] }))
    .slice(1);
}

// A day spans four columns and a hazard's quiet spell may span several: colspan
// is undone so every row is one entry per column, aligned with every other.
function expandCells(cells, value) {
  const out = [];
  for (const cell of cells) {
    for (let i = 0; i < cell.span; i += 1) out.push(value(cell));
  }
  return out;
}

// The table gives days and hours, never a month — the bulletin time supplies
// that, and a column whose day has gone backwards has crossed into the next one.
function tableColumns(dayRow, hourRow, issuedAt) {
  const base = /^(\d{4})-(\d{2})-(\d{2})/.exec(firstString(issuedAt));
  if (!base) return null;
  const days = expandCells(headCells(dayRow), (cell) => Number(/(\d+)日/.exec(cell.text)?.[1]));
  const hours = headCells(hourRow).map((cell) => Number(/(\d+)/.exec(cell.text)?.[1]));
  if (days.length === 0 || days.length !== hours.length) return null;
  if ([...days, ...hours].some((value) => !Number.isFinite(value))) return null;

  let year = Number(base[1]);
  let month = Number(base[2]);
  const pad = (value) => String(value).padStart(2, "0");
  const columns = hours.map((hour, index) => {
    if (index > 0 && days[index] < days[index - 1]) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    // JST is written out rather than assumed: the times go back as instants, and
    // the card is free to show them in whatever zone it is read in.
    return Date.parse(`${year}-${pad(month)}-${pad(days[index])}T${pad(hour)}:00:00+09:00`);
  });
  return columns.some(Number.isNaN) ? null : columns;
}

function parseTimeTable(html, issuedAt) {
  const table = TIME_TABLE_RE.exec(html);
  const dayRow = table && DAY_ROW_RE.exec(table[1]);
  const hourRow = table && HOUR_ROW_RE.exec(table[1]);
  if (!dayRow || !hourRow) return null;
  const columns = tableColumns(dayRow[1], hourRow[1], issuedAt);
  if (!columns) return null;

  const rows = [];
  for (const row of table[1].matchAll(HAZARD_ROW_RE)) {
    const name = HAZARD_NAME_RE.exec(row[1])?.[1]?.trim();
    const cells = [...row[1].matchAll(BODY_CELL_RE)].map((cell) => ({
      span: Number(cell[2] ?? 1),
      kind: CELL_KINDS[CELL_KIND_RE.exec(cell[1])?.[1]] ?? null,
    }));
    const kinds = expandCells(cells, (cell) => cell.kind);
    // A row that is the wrong length is a row this code has misread, and a row
    // with no strength in it — 1時間最大雨量 — is not a hazard's row at all.
    if (!name || kinds.length !== columns.length) continue;
    if (kinds.some((kind) => WARN_SEVERITIES.includes(kind))) rows.push({ name, kinds });
  }
  return rows.length > 0 ? { columns, rows } : null;
}

// The timetable files a hazard under the name of the thing forecast, which is not
// always the name of the warning: 大雨 is 大雨浸水 with the rain beside it, 波浪 is
// 波, and wind comes as 陸上 and 海上 rows under one heading. Tried in order, and
// a hazard with no row of its own — 洪水, which the JMA times nowhere — is left
// without a window rather than given the rain's.
const WARN_ROW_NAMES = {
  大雨: ["大雨"],
  洪水: ["洪水"],
  暴風: ["暴風", "強風", "風"],
  強風: ["強風", "暴風", "風"],
  暴風雪: ["暴風雪", "風雪", "暴風", "強風"],
  風雪: ["風雪", "暴風雪", "強風", "暴風"],
  大雪: ["大雪", "降雪", "雪"],
  波浪: ["波"],
  高潮: ["高潮", "潮位"],
  雷: ["雷"],
  融雪: ["融雪"],
  濃霧: ["濃霧", "霧"],
  乾燥: ["乾燥"],
  なだれ: ["なだれ"],
  低温: ["低温", "気温"],
  霜: ["霜", "最低気温"],
  着氷: ["着氷"],
  着雪: ["着雪"],
  土砂災害: ["土砂災害"],
};

function hazardRows(rows, name) {
  const candidates = WARN_ROW_NAMES[name] ?? [name];
  for (const candidate of candidates) {
    const exact = rows.filter((row) => row.name === candidate);
    if (exact.length > 0) return exact;
  }
  // 大雨 filed as 大雨浸水, 強風 as 強風陸上 — the warning's name leads the row's.
  for (const candidate of candidates) {
    const inside = rows.filter((row) => row.name.startsWith(candidate));
    if (inside.length > 0) return inside;
  }
  return [];
}

function strongest(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return KIND_STRENGTH.indexOf(a) <= KIND_STRENGTH.indexOf(b) ? a : b;
}

// The stretch the hazard is forecast to spend at this warning's own strength —
// the one covering now if the table reaches that far, otherwise the next one.
// Weaker cells are not part of it: a 警報 that softens to a 注意報 at nine has
// stopped being the thing the row is announcing.
function warningWindow(table, item) {
  const rows = hazardRows(table.rows, item.name);
  if (rows.length === 0) return null;
  const rank = WARN_SEVERITIES.indexOf(item.severity);
  const merged = table.columns.map((_, index) =>
    rows.reduce((kind, row) => strongest(kind, row.kinds[index]), null),
  );

  const runs = [];
  merged.forEach((kind, index) => {
    const strength = WARN_SEVERITIES.indexOf(kind);
    if (strength < 0 || strength > rank) return;
    const last = runs[runs.length - 1];
    if (last && last.end === index - 1) last.end = index;
    else runs.push({ start: index, end: index });
  });
  if (runs.length === 0) return null;

  const now = Date.now();
  const run = runs.find((candidate) => table.columns[candidate.end] + CELL_MS > now) ?? runs[0];
  // The forecast running out is not the warning ending: an open window says the
  // outlook stops here, which is a different claim from "lifts at nine".
  const open = run.end === merged.length - 1 || merged[run.end + 1] === "outside";
  return {
    from: new Date(table.columns[run.start]).toISOString(),
    to: open ? null : new Date(table.columns[run.end] + CELL_MS).toISOString(),
  };
}

// One extra request, for the municipality already matched — and the reason the
// card can say more than the prefecture page knows. A page that will not parse
// costs the rows their times and nothing else, so the failure is cached like any
// other answer rather than retried on every reader.
function fetchTimeTable(url, issuedAt) {
  return cached(`warn-times:${url}`, WARN_TTL_MS, async () =>
    parseTimeTable(await getText(url, "text/html"), issuedAt),
  );
}

async function withWindows(url, items, issuedAt) {
  if (items.length === 0) return items;
  const table = await fetchTimeTable(url, issuedAt).catch(() => null);
  if (!table) return items;
  // Copied rather than written into: these items are the cached prefecture
  // page's own objects, shared with every other fix inside it.
  return items.map((item) => ({ ...item, ...(warningWindow(table, item) ?? {}) }));
}

function warnPages(subdivisionCode) {
  const match = /^JP-(\d{2})$/.exec(firstString(subdivisionCode).toUpperCase());
  if (!match) return [];
  const prefecture = Number(match[1]);
  if (prefecture === 1) return HOKKAIDO_PAGES;
  return prefecture >= 2 && prefecture <= 47 ? [String(prefecture)] : [];
}

function warnRegion(subdivisionCode) {
  const match = /^JP-(\d{2})$/.exec(firstString(subdivisionCode).toUpperCase());
  if (!match) return null;
  const prefecture = Number(match[1]);
  const region = WARN_REGIONS.find((candidate) => candidate.prefectures.includes(prefecture));
  if (!region) return null;
  return {
    name: region.name,
    pages: region.pages ?? region.prefectures.map(String),
  };
}

// Yahoo names a municipality the way the country files it, which is sometimes the
// city whole (京都市, 札幌市) and sometimes the ward inside it (広島市中区, 渋谷区).
// The geocoder hands those back in two pieces, so the pair is tried first and
// each half after it — one of the three is the row, whichever way it is filed.
function municipalityNames(place) {
  const city = firstString(place?.name);
  const ward = firstString(place?.locality);
  const names = [];
  for (const name of [city && ward && city !== ward ? city + ward : "", city, ward]) {
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function matchArea(areas, names) {
  for (const name of names) {
    const exact = areas.find((area) => area.name === name);
    if (exact) return exact;
  }
  // A city the geocoder gave no ward for, listed ward by ward: any one of them
  // beats answering for the prefecture, since a warning that stops at a ward
  // boundary is rarer than one that covers the city.
  for (const name of names) {
    const inside = areas.find((area) => area.name.startsWith(name));
    if (inside) return inside;
  }
  return null;
}

// Nothing matched: the geocoder and Yahoo disagree about what this place is
// called. The prefecture is still an answer, and an honest one as long as each
// warning says how much of the prefecture it covers.
function prefectureSummary(areas) {
  const counts = new Map();
  for (const area of areas) {
    for (const item of area.items) {
      const key = `${item.severity}:${item.name}`;
      const current = counts.get(key);
      counts.set(key, {
        ...item,
        areas: (current?.areas ?? 0) + 1,
        areaNames: [...(current?.areaNames ?? []), area.name],
      });
    }
  }
  return [...counts.values()].sort(
    (a, b) =>
      WARN_SEVERITIES.indexOf(a.severity) - WARN_SEVERITIES.indexOf(b.severity) || b.areas - a.areas,
  );
}

function prefectureWarningResult(searched, prefecture) {
  const areas = searched.flatMap((entry) => entry.areas);
  const items = prefectureSummary(areas);
  return {
    covered: true,
    scope: "prefecture",
    area: prefecture,
    prefecture,
    issuedAt: areas.find((area) => area.issuedAt)?.issuedAt ?? null,
    url: `${WARN_HOST}/${searched[0].page}/`,
    areaCount: areas.length,
    items,
  };
}

async function regionWarningResult(region, searched) {
  const byPage = new Map(searched.map((entry) => [entry.page, entry.areas]));
  for (const page of region.pages) {
    if (byPage.has(page)) continue;
    const areas = await fetchWarnPage(page).catch(() => null);
    if (areas) byPage.set(page, areas);
  }
  const regionSearched = region.pages.map((page) => ({ page, areas: byPage.get(page) })).filter((entry) => entry.areas);
  const areas = regionSearched.flatMap((entry) => entry.areas);
  const items = prefectureSummary(areas);
  return {
    covered: true,
    scope: "region",
    area: region.name,
    issuedAt: areas.find((area) => area.issuedAt)?.issuedAt ?? null,
    url: `${WARN_HOST}/`,
    areaCount: areas.length,
    items,
  };
}

export function lookupWarnings(latitude, longitude) {
  return cached(`warnings:${gridKey(latitude, longitude, PLACE_GRID)}`, WARN_TTL_MS, async () => {
    // Asked for in Japanese whatever the reader speaks, because the names are
    // about to be matched against a Japanese page. The reader's own language
    // goes back on by the card, which knows the four severities by name.
    const place = await lookupPlace(latitude, longitude, "ja").catch(() => null);
    const pages = warnPages(supports("warnings", place?.countryCode) ? place.subdivisionCode : "");
    if (pages.length === 0) return { covered: false, items: [] };

    const names = municipalityNames(place);
    const prefecture = firstString(place?.region, place?.name);
    const region = warnRegion(place?.subdivisionCode);
    const searched = [];

    for (const page of pages) {
      const areas = await fetchWarnPage(page).catch(() => null);
      if (!areas) continue;
      searched.push({ page, areas });
      const area = matchArea(areas, names);
      if (!area) continue;
      if (area.items.length === 0 && region) return regionWarningResult(region, searched);
      // The municipality's own page, which is the reading behind the row: the
      // JIS code Yahoo puts on a warning is the town code with two digits of
      // detail after it, and the page is filed under the town — as a number,
      // so Hokkaido's leading zero has to go (0110000 → 1100, not 01100).
      const url = `${WARN_HOST}/${page}/${Number(area.code.slice(0, 5))}/`;
      return {
        covered: true,
        scope: "municipality",
        area: area.name,
        prefecture,
        issuedAt: area.issuedAt,
        url,
        // The one place a from-and-until can be had: 今後の推移 is per
        // municipality, so the wider answers below go without it.
        items: await withWindows(url, area.items, area.issuedAt),
      };
    }

    // Every page for this prefecture is unreadable — say nothing rather than
    // "all clear", which is the one wrong answer a warnings card can give.
    if (searched.length === 0) throw new Error("typhoon.yahoo.co.jp returned no warnings");

    return prefectureWarningResult(searched, prefecture);
  });
}
