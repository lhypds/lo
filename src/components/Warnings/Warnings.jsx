import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card } from "../../ui/index.js";
import { relativeTime } from "../../utils/format.js";
import { warningKindKey } from "../../utils/warnings.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./warnings.module.css";

// What Yahoo! 防災速報 would have pushed to a phone standing here: the 特別警報,
// 警報 and 注意報 in force for this municipality. Japan only — the server says as
// much, and the card takes itself off the dashboard rather than claiming an all
// clear it has no way of knowing.
//
// The answer is per municipality, and the server rounds the fix onto one before
// asking, so the request is keyed as coarsely as that: two decimals, ~1.1 km.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(2)},${coords.longitude.toFixed(2)}`;
}

export default function Warnings() {
  const { t, i18n } = useTranslation();
  const { coords } = useHere();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const key = coordKey(coords);

  useEffect(() => {
    if (!coords) return;
    const ticket = ++requestRef.current;
    setLoading(true);
    api
      .getWarnings(coords)
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
    // Alone among the cards this one does not ask again when the language
    // changes: Yahoo answers in Japanese either way, and every word the card can
    // translate it translates here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Somewhere Yahoo has nothing to say about — the card is not a card here.
  // Kept until the first answer arrives so the tile does not appear and vanish.
  if (result && !result.covered) return null;

  const items = result?.items ?? [];

  let body;
  if (loading && !result) {
    body = <p className={styles.note}>{t("warnings.loading")}</p>;
  } else if (error) {
    body = <p className={styles.note}>{t("warnings.unavailable")}</p>;
  } else if (items.length === 0) {
    body = <p className={styles.note}>{t("warnings.empty")}</p>;
  } else {
    body = (
      <ul className={styles.list}>
        {items.map((item) => {
          const kindKey = warningKindKey(item.name);
          return (
            <li
              key={`${item.severity}:${item.name}`}
              className={item.severity === "emergency" ? styles.gravest : undefined}
            >
              {/* Filled for anything at warning strength, hollow for an
                  advisory: the word beside it is the claim, this is only what
                  the eye catches first. */}
              <span
                className={item.severity === "advisory" ? styles.markHollow : styles.mark}
                aria-hidden="true"
              />
              <span className={styles.kind}>{kindKey ? t(kindKey) : item.name}</span>
              {/* A prefecture-wide answer, because the fix could not be pinned to
                  one of its municipalities — so each row says how much of the
                  prefecture it actually covers rather than implying all of it. */}
              {item.areas != null && (
                <span className={styles.areas}>
                  {item.areas}/{result.areaCount}
                </span>
              )}
              <span className={styles.severity}>{t(`warnings.severity.${item.severity}`)}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card title={t("warnings.title")} meta={result?.area} wide half flush>
      <div className={styles.inner}>
        <div className={styles.scroll}>{body}</div>
        {/* Where it came from and when it was said, in one line that is also the
            way through to the bulletin itself — a warning in three words wants
            somewhere to read the rest. */}
        <a
          className={styles.source}
          href={result?.url ?? "https://typhoon.yahoo.co.jp/weather/jp/warn/"}
          target="_blank"
          rel="noreferrer noopener"
        >
          <span>{t("warnings.source")}</span>
          {result?.issuedAt && (
            <time dateTime={result.issuedAt}>
              {t("warnings.issued", { time: relativeTime(result.issuedAt, i18n.language, t) })}
            </time>
          )}
        </a>
      </div>
    </Card>
  );
}
