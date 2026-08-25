import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card } from "../../ui/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./trends.module.css";

// X answers per metro at best, and the server rounds the fix onto that metro
// before asking — so the request is keyed as coarsely as the place name is.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(1)},${coords.longitude.toFixed(1)}`;
}

export default function TrendsCard() {
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
      .getTrends(coords)
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

  // Trends run to six figures, and the exact number is never the point — the
  // order of magnitude is, so it is shown the way X shows it.
  const compact = useMemo(
    () => new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 }),
    [language],
  );

  const items = result?.items ?? [];
  const configured = result?.configured !== false;

  let body;
  if (!configured) {
    body = <p className={styles.empty}>{t("trends.noToken")}</p>;
  } else if (loading && items.length === 0) {
    body = <p className={styles.empty}>{t("trends.loading")}</p>;
  } else if (error) {
    body = <p className={styles.empty}>{t("trends.unavailable")}</p>;
  } else if (items.length === 0) {
    body = <p className={styles.empty}>{t("trends.empty")}</p>;
  } else {
    body = (
      <ol className={styles.list}>
        {items.map((item, index) => (
          <li key={item.name}>
            <a href={item.url} target="_blank" rel="noreferrer noopener" className={styles.item}>
              <span className={styles.rank}>{index + 1}</span>
              <span className={styles.name}>{item.name}</span>
              {item.count != null && <span className={styles.count}>{compact.format(item.count)}</span>}
            </a>
          </li>
        ))}
      </ol>
    );
  }

  // "Trending in Tokyo" and "trending in Japan" are different claims — the
  // server says which rung of its table the fix landed on, and the heading
  // repeats it rather than letting the reader assume the narrower one.
  const where = configured && result?.name ? result.name : null;

  return (
    <Card title={t("trends.title")} meta={where} wide square flush>
      <div className={styles.scroll}>{body}</div>
    </Card>
  );
}
