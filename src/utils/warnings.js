// Yahoo names the kind of weather in Japanese — 大雨, 波浪, なだれ. Only the key
// lives here; the words are in the i18n files under "warnings.kind", the same
// split weather.js keeps for the sky.
//
// The list is the JMA's own set, which is what Yahoo relays: seven kinds of
// warning, sixteen of advisory, and the two that arrive as neither — 土砂災害,
// which is issued with the prefecture, and 熱中症, which is issued for the heat.
const KINDS = {
  大雨: "rain",
  洪水: "flood",
  暴風: "storm",
  暴風雪: "blizzard",
  大雪: "heavySnow",
  波浪: "waves",
  高潮: "surge",
  強風: "gale",
  風雪: "galeSnow",
  雷: "thunder",
  融雪: "snowmelt",
  濃霧: "fog",
  乾燥: "dry",
  なだれ: "avalanche",
  低温: "lowTemperature",
  霜: "frost",
  着氷: "icing",
  着雪: "snowAccretion",
  土砂災害: "landslide",
  竜巻: "tornado",
  記録的短時間大雨: "recordRain",
  熱中症: "heat",
};

// Nothing back for a kind the table has never seen: the card shows the Japanese
// it arrived as, which is worth more to a reader standing in Japan than a blank
// or a guess would be.
export function warningKindKey(name) {
  return name in KINDS ? `warnings.kind.${KINDS[name]}` : null;
}

// 警戒レベル, the five-step scale the whole country's evacuation advice is written
// against: a 注意報 is level 2, a 警報 level 3, and the two above it 4 and 5. The
// band is what fixes the number — the same mapping Yahoo prints as the heading
// over each group — so nothing has to be fetched to know it.
const LEVELS = { emergency: 5, urgent: 4, warning: 3, advisory: 2 };

export function warningLevel(severity) {
  return LEVELS[severity] ?? null;
}

// The times come off Yahoo's own 今後の推移, which is a Japanese forecast for a
// Japanese municipality — so they are shown on Tokyo's clock wherever they are
// read, rather than sliding an hour because the reader is abroad.
const WARN_ZONE = "Asia/Tokyo";

function tokyoParts(value, locale, options) {
  return new Intl.DateTimeFormat(locale, { timeZone: WARN_ZONE, ...options }).format(value);
}

function tokyoDay(value) {
  return tokyoParts(value, "en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// The start always carries its date, today's included: a window that began at
// 12:00 says nothing about which day that was, and a bulletin read at midnight —
// or hours after it was issued — is exactly when the question comes up. The end
// takes a date only when it falls on another day: 8/26 15:00 — 21:00, 8/26 12:00
// — 8/27 06:00 when it runs past midnight.
export function formatWarningWindow(from, to, locale) {
  const start = Date.parse(from ?? "");
  if (Number.isNaN(start)) return null;
  const end = Date.parse(to ?? "");
  const clock = (value) => tokyoParts(value, locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  const dated = (value) => `${tokyoParts(value, locale, { month: "numeric", day: "numeric" })} ${clock(value)}`;
  const shown = { from: dated(start), to: null };
  if (Number.isNaN(end)) return shown;

  // A window that ends on the stroke of midnight ends at the end of the day it
  // began, and is read as 24:00 — the way the timetable itself labels that edge.
  // Tomorrow's date on it would say the wrong thing about how long it runs.
  const midnight = clock(end) === "00:00" && end - start <= 24 * 60 * 60 * 1000;
  shown.to = midnight ? "24:00" : tokyoDay(end) === tokyoDay(start) ? clock(end) : dated(end);
  return shown;
}
