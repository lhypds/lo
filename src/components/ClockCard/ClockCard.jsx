import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../../ui/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./clock.module.css";

// Open-Meteo hands back sunrise/sunset already in the location's own local time
// ("2026-08-25T05:12"), so the clock face is a slice, not a parse — running it
// through Date would silently re-read it as the visitor's timezone.
function localClockTime(value) {
  return typeof value === "string" && value.includes("T") ? value.slice(11, 16) : "";
}

function formatOffset(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const sign = seconds < 0 ? "-" : "+";
  const total = Math.abs(seconds);
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

export default function ClockCard() {
  const { t, i18n } = useTranslation();
  const { weather } = useHere();
  const [now, setNow] = useState(() => new Date());

  // Aligned to the wall clock rather than to mount: a card that appears at
  // :30.7 still flips its seconds when the second actually turns over.
  useEffect(() => {
    let timer;
    function tick() {
      setNow(new Date());
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    }
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => window.clearTimeout(timer);
  }, []);

  // Until the server answers, the browser's own zone stands in — the numbers are
  // right for the reader even before they are right for the coordinates.
  const zone = weather?.timezone?.id || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = i18n.language;

  const time = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const seconds = new Intl.DateTimeFormat("en-GB", { timeZone: zone, second: "2-digit" }).format(now);
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(now);

  const today = weather?.today;
  const offset = weather?.timezone ? t("clock.offset", { offset: formatOffset(weather.timezone.offsetSeconds) }) : "";

  return (
    <Card title={t("clock.title")} meta={offset} square>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.face}>
            <span className={styles.time}>{time}</span>
            <span className={styles.seconds}>{seconds}</span>
          </div>
          <p className={styles.date}>{date}</p>
        </div>
        <dl className={styles.rows}>
          <div>
            <dt>{t("clock.timezone")}</dt>
            <dd>{zone}</dd>
          </div>
          {today?.sunrise && (
            <div>
              <dt>{t("clock.sunrise")}</dt>
              <dd>{localClockTime(today.sunrise)}</dd>
            </div>
          )}
          {today?.sunset && (
            <div>
              <dt>{t("clock.sunset")}</dt>
              <dd>{localClockTime(today.sunset)}</dd>
            </div>
          )}
        </dl>
      </div>
    </Card>
  );
}
