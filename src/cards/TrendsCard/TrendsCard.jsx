import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Skeleton } from "../../ui/index.js";
import { LARGE, SMALL, TALL, TINY, useCardSize } from "../../utils/cards.js";
import CardSize from "../../components/CardSize/index.js";
import { useHere } from "../../components/LocationProvider/index.js";
import styles from "./trends.module.css";

// Google answers per subregion at best, and the server rounds the fix onto that
// subregion before asking — so the request is keyed as coarsely as the answer.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(1)},${coords.longitude.toFixed(1)}`;
}

export default function TrendsCard() {
  const { t, i18n } = useTranslation();
  const { coords, reloadToken } = useHere();
  // Ten rows by definition, in a tile the reader sizes from one square to six:
  // at the smallest that is a window onto the top few and at the tallest it is
  // very nearly all of it (see utils/cards.js).
  const size = useCardSize("trends");
  // The bottom rung, where the panel stands among the opening squares rather
  // than across the column — the shape of the tile, what its heading has room
  // for, and how a row is cut, all in one word (see trends.module.css).
  const cube = size === TINY;
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // True from the first render rather than from the first effect — see the
  // same line in NewsCard: an empty list a frame before the request goes out
  // would read as "no trends here".
  const [loading, setLoading] = useState(() => Boolean(coords));
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
  }, [key, language, reloadToken]);

  // Google rounds search volume down to a floor — 200+, 20000+ — so the number
  // is an order of magnitude and is shown as one, with the + it arrived with.
  const compact = useMemo(
    () => new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 }),
    [language],
  );

  const items = result?.items ?? [];

  let body;
  if (loading && items.length === 0) {
    body = <Skeleton rows={5} label={t("trends.loading")} />;
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
              <span className={styles.body}>
                <span className={styles.name}>{item.name}</span>
                {/* A search word seldom explains itself — the story behind the
                    spike is what the row actually opens, so it is shown. */}
                {item.headline && <span className={styles.story}>{item.headline}</span>}
              </span>
              {item.count != null && <span className={styles.count}>{compact.format(item.count)}+</span>}
            </a>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <Card
      title={t("trends.title")}
      action={<CardSize id="trends" />}
      // A cube is the one size that is not the width of the panel column: a
      // square standing in a single column of the grid, which is what `square`
      // without `wide` means (see ui/Card).
      wide={!cube}
      half={size === SMALL}
      square={size === LARGE || cube}
      tall={size === TALL}
      flush
      className={cube ? styles.square : undefined}
    >
      <div className={styles.scroll}>{body}</div>
    </Card>
  );
}
