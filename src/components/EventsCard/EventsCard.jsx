import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card } from "../../ui/index.js";
import { relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./events.module.css";

// What is on is a city-wide question, like the news: one decimal place, ~11 km.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(1)},${coords.longitude.toFixed(1)}`;
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

export default function EventsCard() {
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
      .getEvents(coords)
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
    // Same reasoning as the news card: the fix jitters, the rounded key and the
    // language are the only things that make this a different question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, language]);

  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "short", day: "numeric", weekday: "short" }),
    [language],
  );
  const awayFormat = useMemo(() => new Intl.RelativeTimeFormat(language, { numeric: "auto" }), [language]);

  const upcoming = result?.upcoming ?? [];
  const items = result?.items ?? [];
  const nothing = upcoming.length === 0 && items.length === 0;

  let body;
  if (loading && nothing) {
    body = <p className={styles.empty}>{t("events.loading")}</p>;
  } else if (error) {
    body = <p className={styles.empty}>{t("events.unavailable")}</p>;
  } else if (nothing) {
    body = <p className={styles.empty}>{t("events.empty")}</p>;
  } else {
    body = (
      <>
        {upcoming.length > 0 && (
          <section className={styles.group}>
            <h3 className={styles.groupTitle}>{t("events.holidays")}</h3>
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
          </section>
        )}
        {items.length > 0 && (
          <section className={styles.group}>
            <h3 className={styles.groupTitle}>{t("events.happening")}</h3>
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.url}>
                  <a href={item.url} target="_blank" rel="noreferrer noopener" className={styles.item}>
                    <span className={styles.itemTitle}>{item.title}</span>
                    <span className={styles.itemMeta}>
                      <span className={styles.source}>{item.source}</span>
                      {item.time && <time dateTime={item.time}>{relativeTime(item.time, language, t)}</time>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }

  return (
    <Card title={t("events.title")} meta={result?.place?.name} wide flush>
      <div className={styles.scroll}>{body}</div>
    </Card>
  );
}
