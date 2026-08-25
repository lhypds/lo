import { useEffect, useRef, useState } from "react";
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

  const items = result?.items ?? [];

  let body;
  if (loading && items.length === 0) {
    body = <p className={styles.empty}>{t("events.loading")}</p>;
  } else if (error) {
    body = <p className={styles.empty}>{t("events.unavailable")}</p>;
  } else if (items.length === 0) {
    body = <p className={styles.empty}>{t("events.empty")}</p>;
  } else {
    body = (
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
    );
  }

  return (
    <Card title={t("events.title")} meta={result?.place?.name} wide square flush>
      <div className={styles.scroll}>{body}</div>
    </Card>
  );
}
