import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card } from "../../ui/index.js";
import { formatDistance, relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./nearby.module.css";

// Local news is a city-wide question, so the request is keyed a decimal place
// coarser than the weather — one number, about 11 km.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(1)},${coords.longitude.toFixed(1)}`;
}

export default function NearbyCard() {
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
      .getNearby(coords)
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
    // The fix jitters constantly; the rounded key and the language are the only
    // things that make this a different question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, language]);

  const items = result?.items ?? [];
  // GDELT answers with articles; when it has nothing for this corner of the map
  // the server sends Wikipedia's nearby places instead, and the heading follows.
  const kind = items[0]?.kind === "place" ? "places" : "news";

  let body;
  if (loading && items.length === 0) {
    body = <p className={styles.empty}>{t("nearby.loading")}</p>;
  } else if (error) {
    body = <p className={styles.empty}>{t("nearby.unavailable")}</p>;
  } else if (items.length === 0) {
    body = <p className={styles.empty}>{t("nearby.empty")}</p>;
  } else {
    body = (
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.url}>
            <a href={item.url} target="_blank" rel="noreferrer noopener" className={styles.item}>
              <span className={styles.itemTitle}>{item.title}</span>
              <span className={styles.itemMeta}>
                <span className={styles.source}>{item.source}</span>
                {item.time && <time dateTime={item.time}>{relativeTime(item.time, i18n.language, t)}</time>}
                {Number.isFinite(item.distance) && <span>{formatDistance(item.distance)}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card title={t("nearby.title")} meta={items.length > 0 ? t(`nearby.${kind}`) : result?.place?.name} wide flush>
      <div className={styles.scroll}>{body}</div>
    </Card>
  );
}
