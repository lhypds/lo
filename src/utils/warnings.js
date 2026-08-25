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
