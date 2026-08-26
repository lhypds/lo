import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Skeleton } from "../../ui/index.js";
import { relativeTime } from "../../utils/format.js";
import { formatWarningWindow, warningKindKey, warningLevel } from "../../utils/warnings.js";
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
  const { coords, reloadToken } = useHere();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // True from the first render rather than from the first effect — see the
  // same line in NewsCard. It matters most here: "nothing in force" is the one
  // sentence on the dashboard nobody should read before it has been asked.
  const [loading, setLoading] = useState(() => Boolean(coords));
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
    // translate it translates here. The token it does follow — of everything on
    // the dashboard this is the one worth pressing refresh for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadToken]);

  // Somewhere Yahoo has nothing to say about — the card is not a card here.
  // Kept until the first answer arrives so the tile does not appear and vanish.
  if (result && !result.covered) return null;

  const items = result?.items ?? [];

  let body;
  if (loading && !result) {
    body = <Skeleton rows={3} label={t("warnings.loading")} />;
  } else if (error) {
    body = <p className={styles.note}>{t("warnings.unavailable")}</p>;
  } else if (items.length === 0) {
    body = <p className={styles.note}>{t("warnings.empty")}</p>;
  } else {
    body = (
      <ul className={styles.list}>
        {items.map((item, index) => {
          const kindKey = warningKindKey(item.name);
          const itemKey = `${item.severity}:${item.name}:${index}`;
          const areaNames = item.areaNames?.length ? item.areaNames : [result.area].filter(Boolean);
          const areaPreview = areaNames.slice(0, 8).join("、");
          const remainingAreas = areaNames.length - 8;
          const level = warningLevel(item.severity);
          // Only the municipality answer carries a window, and only for a hazard
          // the outlook table has a row for — the rest of the rows go without.
          const outlook = formatWarningWindow(item.from, item.to, i18n.language);
          return (
            <li
              key={itemKey}
              className={item.severity === "emergency" ? styles.gravest : undefined}
            >
              {/* The row itself is the way through to the bulletin: three words
                  and a clock cannot carry what the page behind them says, and a
                  warning is not the place to make a reader hunt for the link. */}
              <a
                className={styles.item}
                href={result.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span className={styles.row}>
                  {/* Filled for anything at warning strength, hollow for an
                      advisory: the word beside it is the claim, this is only what
                      the eye catches first. */}
                  <span
                    className={item.severity === "advisory" ? styles.markHollow : styles.mark}
                    aria-hidden="true"
                  />
                  <span className={styles.kind}>{kindKey ? t(kindKey) : item.name}</span>
                  {/* A wider answer, because the fix had no local warning — so
                      each row says how much of that wider area it covers. */}
                  {item.areas != null && (
                    <span className={styles.areas}>
                      {item.areas}/{result.areaCount}
                    </span>
                  )}
                  <span className={styles.severity}>{t(`warnings.severity.${item.severity}`)}</span>
                  {/* 警戒レベル, the number the country's evacuation advice is
                      written against — the word beside it says what was issued,
                      this says how far up the scale it is. */}
                  {level != null && (
                    <span className={styles.level}>{t("warnings.level", { level })}</span>
                  )}
                </span>
                <span className={styles.detail}>
                  {/* From when until when it is forecast to stay this strong, on
                      Tokyo's clock. An end the forecast never reaches is left
                      open, because the outlook running out is not the warning
                      lifting. */}
                  {outlook && (
                    <time className={styles.outlook} dateTime={item.from}>
                      {outlook.to
                        ? t("warnings.window", { from: outlook.from, to: outlook.to })
                        : t("warnings.windowOpen", { from: outlook.from })}
                    </time>
                  )}
                  {areaPreview && (
                    <span>
                      {areaPreview}
                      {remainingAreas > 0 ? ` +${remainingAreas}` : ""}
                    </span>
                  )}
                </span>
              </a>
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
        {/* When it was said, which on this card is half the answer: an hour-old
            bulletin may have been lifted since. The way through to the reading
            behind it is the row itself. */}
        {result?.issuedAt && (
          <p className={styles.issued}>
            <time dateTime={result.issuedAt}>
              {t("warnings.issued", { time: relativeTime(result.issuedAt, i18n.language, t) })}
            </time>
          </p>
        )}
      </div>
    </Card>
  );
}
