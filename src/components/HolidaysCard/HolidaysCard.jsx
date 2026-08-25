import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card } from "../../ui/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./holidays.module.css";

// A holiday is a national or regional fact, not a street-corner one — two
// decimals, the same grid the place name is looked up on.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(2)},${coords.longitude.toFixed(2)}`;
}

// A holiday is a date, not a moment. Date.parse("2026-09-21") reads it as UTC
// midnight, which hands back the day before to everyone west of Greenwich — so
// the parts are read off the string and rebuilt as a local date instead.
function localDate(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!parts) return null;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

function daysUntil(date) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return Math.round((date - midnight) / 86_400_000);
}

export default function HolidaysCard() {
  const { t, i18n } = useTranslation();
  const { coords } = useHere();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const key = coordKey(coords);
  const language = i18n.language;

  useEffect(() => {
    if (!coords) return;
    const ticket = ++requestRef.current;
    setLoading(true);
    api
      .getHolidays(coords)
      .then((data) => {
        if (ticket !== requestRef.current) return;
        setResult(data);
        setError(null);
      })
      .catch((requestError) => {
        if (ticket !== requestRef.current) return;
        setError(requestError);
      })
      .finally(() => {
        if (ticket === requestRef.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, language]);

  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "short", day: "numeric", weekday: "short" }),
    [language],
  );
  const awayFormat = useMemo(() => new Intl.RelativeTimeFormat(language, { numeric: "auto" }), [language]);

  const upcoming = result?.upcoming ?? [];

  let body;
  if (loading && upcoming.length === 0) {
    body = <p className={styles.empty}>{t("holidays.loading")}</p>;
  } else if (error) {
    body = <p className={styles.empty}>{t("holidays.unavailable")}</p>;
  } else if (upcoming.length === 0) {
    body = <p className={styles.empty}>{t("holidays.empty")}</p>;
  } else {
    body = (
      <ul className={styles.dates}>
        {upcoming.map((holiday) => {
          const date = localDate(holiday.date);
          const away = date ? daysUntil(date) : null;
          return (
            <li key={`${holiday.date}-${holiday.title}`}>
              <time className={styles.when} dateTime={holiday.date}>
                {date ? dayFormat.format(date) : holiday.date}
              </time>
              <span className={styles.what}>
                {holiday.title}
                {holiday.subtitle && <span className={styles.gloss}>{holiday.subtitle}</span>}
              </span>
              {away != null && <span className={styles.away}>{awayFormat.format(away, "day")}</span>}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card title={t("holidays.title")} meta={result?.place?.country} wide flush>
      {body}
    </Card>
  );
}
