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
// - Wikipedia      — nearby places           https://www.mediawiki.org/wiki/API
// - Yahoo! 天気・災害 — Japanese weather warnings https://typhoon.yahoo.co.jp
//
// Requests are coarse-keyed and cached: a phone reporting a position every few
// seconds keeps hitting the same cache entry rather than the same upstream.
//
// None of the Google ones cover the whole world, and countries.js is where that
// is written down — so a feed this file would only be told "no" about is never
// asked for at all.

import { newsEdition, supports } from "./countries.js";

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
      // ISO-3166-2, e.g. "JP-26" — the form Google Trends files its subregional
      // lists under, which is what lets the trends card be prefecture-level
      subdivisionCode: firstString(data.principalSubdivisionCode),
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

function warnPages(subdivisionCode) {
  const match = /^JP-(\d{2})$/.exec(firstString(subdivisionCode).toUpperCase());
  if (!match) return [];
  const prefecture = Number(match[1]);
  if (prefecture === 1) return HOKKAIDO_PAGES;
  return prefecture >= 2 && prefecture <= 47 ? [String(prefecture)] : [];
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
      counts.set(key, { ...item, areas: (counts.get(key)?.areas ?? 0) + 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) =>
      WARN_SEVERITIES.indexOf(a.severity) - WARN_SEVERITIES.indexOf(b.severity) || b.areas - a.areas,
  );
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
    const prefecture = firstString(place.region, place.name);
    const searched = [];

    for (const page of pages) {
      const areas = await fetchWarnPage(page).catch(() => null);
      if (!areas) continue;
      searched.push({ page, areas });
      const area = matchArea(areas, names);
      if (!area) continue;
      return {
        covered: true,
        scope: "municipality",
        area: area.name,
        prefecture,
        issuedAt: area.issuedAt,
        // The municipality's own page, which is the reading behind the row: the
        // JIS code Yahoo puts on a warning is the town code with two digits of
        // detail after it, and the page is filed under the town — as a number,
        // so Hokkaido's leading zero has to go (0110000 → 1100, not 01100).
        url: `${WARN_HOST}/${page}/${Number(area.code.slice(0, 5))}/`,
        items: area.items,
      };
    }

    // Every page for this prefecture is unreadable — say nothing rather than
    // "all clear", which is the one wrong answer a warnings card can give.
    if (searched.length === 0) throw new Error("typhoon.yahoo.co.jp returned no warnings");

    const areas = searched.flatMap((entry) => entry.areas);
    return {
      covered: true,
      scope: "prefecture",
      area: prefecture,
      prefecture,
      issuedAt: areas.find((area) => area.issuedAt)?.issuedAt ?? null,
      url: `${WARN_HOST}/${searched[0].page}/`,
      areaCount: areas.length,
      items: prefectureSummary(areas),
    };
  });
}
