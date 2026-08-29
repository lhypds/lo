import { useTranslation } from "react-i18next";
import { Card, Skeleton } from "../../ui/index.js";
import { toFahrenheit, toggleFahrenheit, useFahrenheit } from "../../utils/units.js";
import { weatherIcon, weatherLabelKey } from "../../utils/weather.js";
import { useHere } from "../LocationProvider/index.js";
import WeatherGlyph from "./WeatherGlyph.jsx";
import styles from "./weather.module.css";

function round(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
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
      <Card title={t("weather.title")} square>
        {loadingLocal ? (
          <Skeleton fill label={t("common.loading")} />
        ) : (
          <p className={styles.empty}>{t("weather.unavailable")}</p>
        )}
      </Card>
    );
  }

  const { current, today, upcoming, units } = weather;
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
    <Card title={t("weather.title")} meta={range} square>
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
              beside now instead of competing with the bottom rows for the eye. */}
          {upcoming?.length > 0 && (
            <ul className={styles.forecast}>
              {upcoming.map((day) => (
                <li key={day.date}>
                  <span className={styles.forecastDay}>{dayName(day.date, i18n.language)}</span>
                  <WeatherGlyph icon={weatherIcon(day.weatherCode)} className={styles.forecastGlyph} />
                  <span className={styles.forecastTemp}>
                    {degrees(day.tempMax)}°/{degrees(day.tempMin)}°
                  </span>
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
              {round(current.windSpeed)} {units?.wind ?? "km/h"}
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}
