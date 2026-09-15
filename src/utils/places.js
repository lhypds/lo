import * as api from "../api.js";
import i18n from "../i18n/index.js";

// The places a name typed into the travel sheet could be, best guess first, in
// whichever of lo's six languages it was typed — London is London typed as
// London, Londres, 伦敦 or ロンドン. Two geocoders stand behind this, each for the
// names it reads well.
//
// A name written in Latin letters goes to lo's own server, which asks Open-Meteo
// in every language such a name could be in and puts the answers together (see
// findPlaces in server/geo.js): Pekín, Moskau and Venise each come back first in
// their own language there, ranked by how many people live in them.
//
// A name in any other script goes to Mapbox, straight from the browser on the
// map's own token (see MapCard) — the token is the browser's, and the server holds
// no credentials. Open-Meteo reads Chinese only as GeoNames spells it, mostly
// traditional, and not 伦敦, 纽约 or 首尔 at all; Mapbox reads all of those, in
// either script and from the first character. Without a token, or when Mapbox
// will not answer, those names go to the server as well, which still finds many.
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAPBOX_URL = "https://api.mapbox.com/search/geocode/v6/forward";

// lo's languages as Mapbox writes them; lo's Chinese is the simplified one.
const MAPBOX_LANGUAGE = { en: "en", zh: "zh-Hans", ja: "ja", fr: "fr", es: "es", de: "de" };

// Places rather than streets and shops: the kinds of somewhere a person goes to.
const MAPBOX_TYPES = "country,region,district,place,locality";

// As many rows as the sheet's list shows, the same as the server's answer.
const LIMIT = 5;

// Longer than a geocoder answering takes, and short of a sheet saying "Finding"
// for good over a connection that has gone.
const MAPBOX_TIMEOUT_MS = 10 * 1000;

// A letter of any script but the Latin one. Digits, spaces, punctuation and
// accents belong to no script in particular, so a name written in Latin letters
// with any of them is still a Latin one.
const NOT_LATIN = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

// Mapbox's answers already had on this page, so a letter typed and taken back
// does not ask again. The server keeps its own for the other half.
const answered = new Map();
const REMEMBERED = 100;

function remember(key, places) {
  answered.set(key, places);
  if (answered.size > REMEMBERED) answered.delete(answered.keys().next().value);
}

async function findOnMapbox(query, language, signal) {
  const own = MAPBOX_LANGUAGE[language] ?? "en";
  const url = new URL(MAPBOX_URL);
  url.search = new URLSearchParams({
    q: query,
    access_token: TOKEN,
    autocomplete: "true",
    types: MAPBOX_TYPES,
    limit: String(LIMIT),
    // All of lo's languages, the reader's first: Mapbox matches the name in any
    // of them, and names what it finds in the first.
    language: [own, ...Object.values(MAPBOX_LANGUAGE).filter((code) => code !== own)].join(","),
  });

  // Its own controller, answering to the sheet's (the next letter) and to the
  // clock alike — and not lo's request helper, which would hand Mapbox the
  // session along with the question.
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, MAPBOX_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
    if (!response.ok) throw new Error(`Mapbox returned HTTP ${response.status}`);
    const data = await response.json();
    const seen = new Set();
    return (data.features ?? [])
      .map((feature) => {
        const properties = feature.properties ?? {};
        const { latitude, longitude } = properties.coordinates ?? {};
        // The name in the reader's language, which is not the name that matched:
        // 伦敦 typed by a reader in English is a row reading London.
        const name = properties.name_preferred || properties.name;
        if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        const region = properties.context?.region?.name ?? "";
        const country = properties.context?.country?.name ?? "";
        return {
          name,
          region: region === name ? "" : region,
          country: country === name ? "" : country,
          latitude,
          longitude,
        };
      })
      .filter((place) => {
        const key = place && `${place.name}|${place.region}|${place.country}`;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function findPlaces(query, { signal } = {}) {
  const language = i18n.language || "en";
  if (TOKEN && NOT_LATIN.test(query)) {
    const key = `${language}:${query}`;
    if (answered.has(key)) return answered.get(key);
    try {
      const places = await findOnMapbox(query, language, signal);
      remember(key, places);
      return places;
    } catch (error) {
      // A question the next letter has overtaken is over. Anything else — the
      // token refused, Mapbox down, the clock run out — is lo's own server's to
      // answer instead.
      if (signal?.aborted) throw error;
    }
  }
  const { places } = await api.findPlaces(query, { signal });
  return Array.isArray(places) ? places : [];
}
