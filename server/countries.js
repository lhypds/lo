// The country list — which of lo's cards each country can actually feed.
//
// Not everything the dashboard shows is answerable everywhere. Open-Meteo has a
// temperature and an IANA zone for any pair of coordinates on earth, Mapbox has
// a tile for all of them and Wikipedia has something within ten kilometres of
// nearly anywhere, so the clock, the weather, the map and the news stand up
// wherever the fix lands. Three feeds do not:
//
// - Google Trends keeps a trending list for 125 countries and answers for the
//   other 125 with a flat 400. Google publishes no list of which is which, so
//   the table below was built by asking it about every country there is.
// - Google News runs an edition in 71 countries and redirects the rest onto the
//   American one — gl=ER does not fetch what Eritrea is reading, it fetches what
//   Washington is. The editions were read off those same redirects.
// - Yahoo! 天気・災害 carries 気象庁's warnings for the 47 prefectures of Japan
//   and for nowhere else. Not a coverage gap so much as a national institution:
//   there is no equivalent to point the same card at in the next country.
//
// The two Google tables were read from the upstreams on 2026-08-26 and are the
// sort of thing that changes a country or two a year, not a week.
//
// So the dashboard is not the same dashboard everywhere. A card whose upstream
// has nothing to say about this country is not rendered at all, rather than
// rendered empty: an empty Trends card in Ulaanbaatar reads as "nobody in
// Mongolia is searching for anything", and an empty warnings card anywhere reads
// as "all clear" — claims lo would be inventing.
//
// Posts, marks and the people dots are lo's own and belong to no country, so
// they are not in here.

/* -------------------------------------------------------------- components */

// Every location-fed part of the dashboard, in the order the page lays them out
// — which is the order componentsFor returns them in, so the caller can render
// straight down the list.
export const COMPONENTS = ["clock", "weather", "warnings", "map", "nearby", "events", "trends"];

/* --------------------------------------------------------------- countries */

// Every ISO 3166-1 alpha-2 code currently assigned, plus XK for Kosovo — which
// is only user-assigned, but is what BigDataCloud answers with, and a code the
// reverse geocoder can return is a country lo can find itself standing in.
export const COUNTRY_CODES = `
  AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR
  BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ
  EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW
  GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY
  KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV
  MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
  QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG
  TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA
  ZM ZW
`
  .trim()
  .split(/\s+/);

const KNOWN = new Set(COUNTRY_CODES);

// A code from an upstream is a string of unknown case, and out at sea it is an
// empty one. Anything this does not recognise is treated as nowhere in
// particular, which is exactly what it is.
function normalize(countryCode) {
  const code = String(countryCode ?? "").trim().toUpperCase();
  return KNOWN.has(code) ? code : "";
}

/* ------------------------------------------------------------------ trends */

// Where trends.google.com/trending/rss?geo=<CC> answers rather than 400s. Its
// subregions follow the country: no country, no JP-26 either.
const TRENDS_REGIONS = new Set(
  `
  AE AL AM AO AR AT AU AZ BA BD BE BF BG BH BJ BO BR BY CA CD CH CI CL CM CO CR CU CY CZ
  DE DK DO DZ EC EE EG ES ET FI FR GB GE GH GR GT HK HN HR HT HU ID IE IL IN IQ IR IT JM
  JO JP KE KG KH KR KW KZ LB LK LT LV LY MA MD MK ML MM MX MY MZ NG NI NL NO NP NZ OM PA
  PE PH PK PL PR PS PT PY QA RO RS RU SA SE SG SI SK SN SV SY TH TM TN TR TT TW TZ UA UG
  US UY UZ VE VN YE ZA ZM ZW
`
    .trim()
    .split(/\s+/),
);

/* -------------------------------------------------------------------- news */

// The countries Google News runs an edition for, as
// <code>/<reading language, its hl>/<the language half of its ceid>. Google
// answers gl=<CC> alone by redirecting onto exactly these two values, so naming
// them outright costs a country nothing and saves the redirect.
//
// Note how few of them there are next to how many countries there are: 71. The
// other 179 have no edition, and asking for one anyway does not fail, it
// silently serves the American edition — which is why the absence has to be
// written down rather than discovered.
const NEWS_EDITIONS = new Map(
  `
  AE/ar/ar AR/es-419/es-419 AT/de/de AU/en-AU/en BD/bn/bn BE/nl/nl BG/bg/bg BR/pt-BR/pt-419
  BW/en-BW/en CA/en-CA/en CH/de/de CL/es-419/es-419 CN/zh-CN/zh-Hans CO/es-419/es-419
  CZ/cs/cs DE/de/de EE/et-EE/et EG/ar/ar ES/es/es ET/en-ET/en FI/fi-FI/fi FR/fr/fr
  GB/en-GB/en GH/en-GH/en GR/el/el HK/zh-HK/zh-Hant HU/hu/hu ID/en-ID/en IE/en-IE/en
  IL/en-IL/en IN/en-IN/en IT/it/it JP/ja/ja KE/en-KE/en KR/ko/ko LB/ar/ar LT/lt/lt
  LV/en-LV/en MA/fr/fr MX/es-419/es-419 MY/en-MY/en NA/en-NA/en NG/en-NG/en NL/nl/nl
  NO/no/no NZ/en-NZ/en PE/es-419/es-419 PH/en-PH/en PK/en-PK/en PL/pl/pl PT/pt-PT/pt-150
  RO/ro/ro RS/sr/sr RU/ru/ru SA/ar/ar SE/sv/sv SG/en-SG/en SI/sl/sl SK/sk/sk SN/fr/fr
  TH/th/th TR/tr/tr TW/zh-TW/zh-Hant TZ/en-TZ/en UA/uk/uk UG/en-UG/en US/en-US/en
  VE/es-419/es-419 VN/vi/vi ZA/en-ZA/en ZW/en-ZW/en
`
    .trim()
    .split(/\s+/)
    .map((entry) => {
      const [code, hl, ceid] = entry.split("/");
      return [code, { hl, gl: code, ceid: `${code}:${ceid}` }];
    }),
);

// The place's own edition, or null where it has none.
export function newsEdition(countryCode) {
  return NEWS_EDITIONS.get(normalize(countryCode)) ?? null;
}

/* -------------------------------------------------------------- the answer */

// The whole of what makes one country's dashboard differ from another's: a
// component named here is shown only where its rule says yes, and a component
// not named here is shown everywhere. Adding a fourth upstream that stops at a
// border is a line in this object and nothing else.
const COVERAGE = {
  trends: (code) => TRENDS_REGIONS.has(code),
  warnings: (code) => code === "JP",
};

// Whether one component has anything to say in one country. The server asks
// before it fetches — the point of a list of what an upstream does not cover is
// not having to spend a round trip finding out.
export function supports(component, countryCode) {
  if (!COMPONENTS.includes(component)) return false;
  const rule = COVERAGE[component];
  return rule ? rule(normalize(countryCode)) : true;
}

// What the dashboard can show someone standing in this country, in page order.
// Written as a filter over COMPONENTS so the order the page reads in never
// depends on which rules happened to pass.
export function componentsFor(countryCode) {
  return COMPONENTS.filter((component) => supports(component, countryCode));
}

// The whole list, for /api/countries: every country lo can find itself in and
// what it would be able to show there. Names come from ICU rather than from a
// column of their own — Node has all three of lo's languages, and a name is not
// something this file should be maintaining a copy of.
export function countryList(lang = "en") {
  const names = new Intl.DisplayNames([lang], { type: "region", fallback: "code" });
  return COUNTRY_CODES.map((code) => ({
    code,
    name: names.of(code),
    components: componentsFor(code),
    newsEdition: NEWS_EDITIONS.has(code),
  }));
}
