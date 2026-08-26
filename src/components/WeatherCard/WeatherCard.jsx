import { useTranslation } from "react-i18next";
import { Card, Skeleton } from "../../ui/index.js";
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

  // The tile stands either way — only what is in it waits. Bars while the
  // reading is on its way, and the sentence only once it is in and there is
  // still no weather in it.
  if (!weather) {
    return (
      <Card title={t("weather.title")} openHead square>
        {loadingLocal ? (
          <Skeleton fill label={t("common.loading")} />
        ) : (
          <p className={styles.empty}>{t("weather.unavailable")}</p>
        )}
      </Card>
    );
  }

  const { current, today, upcoming, units } = weather;
  const unit = units?.temperature ?? "°C";
  const label = t(weatherLabelKey(current.weatherCode));

  // The day's range goes in the header and the condition under the temperature,
  // which puts this tile in the same three parts as the clock beside it: a big
  // number, a line naming what it is, and the readings along the bottom.
  const range = today ? `${round(today.tempMax)}° / ${round(today.tempMin)}°` : null;

  return (
    <Card title={t("weather.title")} openHead meta={range} square>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.now}>
            <WeatherGlyph icon={weatherIcon(current.weatherCode)} className={styles.glyph} />
            <span className={styles.temp}>
              {round(current.temperature)}
              <span className={styles.unit}>{unit}</span>
            </span>
          </div>
          <p className={styles.condition}>{label}</p>
        </div>
        <dl className={styles.rows}>
          <div>
            <dt>{t("weather.feelsLike")}</dt>
            <dd>
              {round(current.apparent)}
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
        {upcoming?.length > 0 && (
          <ul className={styles.forecast}>
            {upcoming.map((day) => (
              <li key={day.date}>
                <span className={styles.forecastDay}>{dayName(day.date, i18n.language)}</span>
                <WeatherGlyph icon={weatherIcon(day.weatherCode)} className={styles.forecastGlyph} />
                <span className={styles.forecastTemp}>
                  {round(day.tempMax)}° / {round(day.tempMin)}°
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
