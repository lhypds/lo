import { useTranslation } from "react-i18next";
import { Card, Skeleton } from "../../ui/index.js";
import { cardTurned, turnCard } from "../../utils/cards.js";
import { toFahrenheit, toggleFahrenheit, useFahrenheit } from "../../utils/units.js";
import { weatherIcon, weatherLabelKey } from "../../utils/weather.js";
import { useHere } from "../../components/LocationProvider/index.js";
import CardSize from "../../components/CardSize/index.js";
import WeatherGlyph from "./WeatherGlyph.jsx";
import WeatherHours from "./WeatherHours.jsx";
import styles from "./weather.module.css";

function round(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

// The middle of a day's range, for the tile that has not the room to say both
// ends of it (see weather.module.css). Taken in the scale the server answered in
// and converted afterwards, which comes to the same figure either way — the
// conversion is a straight line — and leaves the rounding where every other
// reading on this tile has it, in `degrees`.
//
// Nothing where either end is missing: a day that only knows its high has no
// middle, and half a range averaged with nothing is a temperature lo would be
// making up.
function midpoint(day) {
  return Number.isFinite(day.tempMax) && Number.isFinite(day.tempMin)
    ? (day.tempMax + day.tempMin) / 2
    : null;
}

function dayName(date, locale) {
  const parsed = Date.parse(`${date}T12:00:00`);
  if (Number.isNaN(parsed)) return date;
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(parsed));
}

export default function WeatherCard() {
  const { t, i18n } = useTranslation();
  const { weather, loadingLocal } = useHere();
  const fahrenheit = useFahrenheit();

  // The tile stands either way — only what is in it waits. Bars while the
  // reading is on its way, and the sentence only once it is in and there is
  // still no weather in it.
  if (!weather) {
    return (
      // The minus stands in the heading whether or not the reading arrived: a
      // card that is waiting or empty is exactly the one a reader may want off
      // the page.
      <Card title={t("weather.title")} action={<CardSize id="weather" />} square>
        {loadingLocal ? (
          <Skeleton fill label={t("common.loading")} />
        ) : (
          <p className={styles.empty}>{t("weather.unavailable")}</p>
        )}
      </Card>
    );
  }

  const { current, today, upcoming, hours, units } = weather;
  // Every temperature on this tile goes through one reading, so that the figure,
  // the range in the heading, the feel of it and the days ahead are never in two
  // scales at once. The server's own unit is what the conversion is decided on
  // rather than the reader's choice alone: Open-Meteo answers lo in Celsius and
  // always has (see server/geo.js), and a source that ever said otherwise should
  // be passed through rather than converted twice.
  const source = units?.temperature ?? "°C";
  const converted = fahrenheit && !source.includes("F");
  const degrees = (value) => round(converted ? toFahrenheit(value) : value);
  const unit = converted ? "°F" : source;
  const label = t(weatherLabelKey(current.weatherCode));
  const turnScale = t(converted ? "weather.toCelsius" : "weather.toFahrenheit");

  // The day's range goes in the header and the condition under the temperature,
  // which puts this tile in the same three parts as the clock beside it: a big
  // number, a line naming what it is, and the readings along the bottom.
  //
  // Hard against the slash, as in the days ahead below: a range is one reading
  // said at both its ends, and spaces around the stroke set it out as two.
  const range = today ? `${degrees(today.tempMax)}°/${degrees(today.tempMin)}°` : null;

  return (
    // The other side of this card is the same sky hour by hour, a double-click on
    // the heading away (see ui/Card) — the glance turned into the look. A server
    // that answered without the hours leaves the card one-sided rather than
    // two-sided with nothing on the back of it.
    //
    // Which face is up is kept with the rest of what the reader has settled about
    // this tile (see utils/cards.js), for the reason the clock's is: the dashboard
    // is unmounted whenever they go anywhere else in the app, and a reader who
    // left the hours showing should not come back to the day.
    <Card
      title={t("weather.title")}
      meta={range}
      action={<CardSize id="weather" />}
      square
      flipHint={t("weather.turn")}
      defaultFlipped={cardTurned("weather")}
      onFlip={(turned) => turnCard("weather", turned)}
      back={hours?.length > 0 && <WeatherHours hours={hours} zone={weather.timezone?.id} degrees={degrees} />}
    >
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.current}>
            <div className={styles.now}>
              <WeatherGlyph icon={weatherIcon(current.weatherCode)} className={styles.glyph} />
              {/* One press and the whole tile is read in the other scale — see
                  utils/units.js for why that answer is the reader's and why it
                  is taken on the figure rather than in a settings panel. The
                  hint rides as a title, which leaves the temperature itself as
                  the button's name. */}
              <button type="button" className={styles.temp} onClick={toggleFahrenheit} title={turnScale}>
                {degrees(current.temperature)}
                <span className={styles.unit}>{unit}</span>
              </button>
            </div>
            <p className={styles.condition}>{label}</p>
          </div>
          {/* The days ahead ride in the corner opposite the temperature
              rather than under the readings: they are the same kind of thing as
              the range in the header — a short forecast — and up here they read
              beside now instead of competing with the bottom rows for the eye.

              Both readings of a day are written out and the tile shows the one
              it has room for — the range where there is room for seven
              characters, the middle of it where there is only room for three,
              and neither where the week itself is all that will fit (see
              weather.module.css). In the stylesheet rather than measured here
              because it is a question about the tile's width, which is what a
              container query is: no observer, no second render, and the answer
              is right on the first paint at every size the grid deals. */}
          {upcoming?.length > 0 && (
            <ul className={styles.forecast}>
              {upcoming.map((day) => (
                <li key={day.date}>
                  <span className={styles.forecastDay}>{dayName(day.date, i18n.language)}</span>
                  <WeatherGlyph icon={weatherIcon(day.weatherCode)} className={styles.forecastGlyph} />
                  <span className={styles.forecastRange}>
                    {degrees(day.tempMax)}°/{degrees(day.tempMin)}°
                  </span>
                  <span className={styles.forecastMean}>{degrees(midpoint(day))}°</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <dl className={styles.rows}>
          <div>
            <dt>{t("weather.feelsLike")}</dt>
            <dd>
              {degrees(current.apparent)}
              {unit}
            </dd>
          </div>
          <div>
            <dt>{t("weather.humidity")}</dt>
            <dd>{round(current.humidity)}%</dd>
          </div>
          <div>
            <dt>{t("weather.wind")}</dt>
            <dd>
              {round(current.windSpeed)}
              {units?.wind ?? "km/h"}
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}
