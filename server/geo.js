// Everything the app knows about "here" comes from this file. The browser hands
// over a pair of coordinates and nothing else, so the server turns them into a
// place name, a clock, a sky and a list of what is happening nearby.
//
// All five upstreams are key-free public APIs:
// - BigDataCloud   — reverse geocoding      https://www.bigdatacloud.com
// - Open-Meteo     — weather and timezone   https://open-meteo.com
// - Google News    — local news (RSS)       https://news.google.com/rss
// - Wikipedia      — nearby places          https://www.mediawiki.org/wiki/API
// - Nager.Date     — public holidays        https://date.nager.at
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
      // ISO-3166-2, e.g. "JP-26" — the same form Nager.Date files its regional
      // holidays under, which is what makes the two comparable
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

// Two questions under one heading, because neither answers "what is happening
// here" on its own: the calendar knows what is coming and has real dates for it,
// the newswire knows what is on this week and has real detail.
const HOLIDAY_HOST = "https://date.nager.at/api/v3";
const HOLIDAY_TTL_MS = 12 * 60 * 60 * 1000;
const EVENTS_TTL_MS = 30 * 60 * 1000;
// Nothing found is worth asking again about soon; a full answer keeps.
const EVENTS_EMPTY_TTL_MS = 5 * 60 * 1000;
const MAX_HOLIDAYS = 5;
const MAX_EVENT_ITEMS = 12;

// Nager answers per country, so every city in one shares a cache entry and the
// regional filtering happens per caller instead.
function fetchHolidays(countryCode) {
  if (!/^[A-Za-z]{2}$/.test(countryCode ?? "")) return Promise.resolve([]);
  const country = countryCode.toUpperCase();
  return cached(`holidays:${country}`, HOLIDAY_TTL_MS, () =>
    getJson(`${HOLIDAY_HOST}/NextPublicHolidays/${country}`),
  );
}

// A holiday with counties is only a holiday in those counties — Reformationstag
// is a day off in Thüringen and a working Friday in Bavaria. Where the fix has
// no subdivision to compare against, only the nationwide ones are safe to claim.
function holidaysHere(list, subdivisionCode) {
  return (Array.isArray(list) ? list : [])
    .filter((holiday) => holiday.global || (holiday.counties ?? []).includes(subdivisionCode))
    .slice(0, MAX_HOLIDAYS)
    .map((holiday) => ({
      kind: "holiday",
      // A plain calendar date, deliberately not a timestamp: the day is the day
      // wherever the reader happens to be standing.
      date: holiday.date,
      // The day's own name first — 敬老の日 is what the posters in the street
      // say, and the English gloss only helps someone who cannot read it.
      title: firstString(holiday.localName, holiday.name),
      subtitle: holiday.name && holiday.name !== holiday.localName ? holiday.name : "",
    }));
}

// One word per language the app speaks, ORed together, because the event worth
// knowing about is written up in the language of the place and not necessarily
// in the reader's: a Chinese reader in Kyoto wants 嵯峨天皇祭, and searching for
// 活动 alone finds them 部活動 — school clubs — instead.
const EVENT_TERMS = "(イベント OR events OR 活动 OR 祭)";
// An event is stale the moment it is over, so the listing only looks back a
// fortnight — long enough to catch a run that is still going.
const EVENT_WINDOW = "when:14d";

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
  const ttl = (value) =>
    value.upcoming.length + value.items.length === 0 ? EVENTS_EMPTY_TTL_MS : EVENTS_TTL_MS;

  return cached(key, ttl, async () => {
    const place = await lookupPlace(latitude, longitude, language).catch(() => null);

    // Half an answer beats none: the holidays still stand when the newswire is
    // unreachable, and the other way round.
    const [upcoming, items] = await Promise.all([
      fetchHolidays(place?.countryCode)
        .then((list) => holidaysHere(list, place?.subdivisionCode))
        .catch(() => []),
      fetchEventNews(place, readerLocale(language, place?.countryCode)),
    ]);

    return { place, upcoming, items: dedupe(items).slice(0, MAX_EVENT_ITEMS) };
  });
}
