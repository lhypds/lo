import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Skeleton } from "../../ui/index.js";
import { LARGE, SMALL, TALL, TINY, useCardSize } from "../../utils/cards.js";
import { distanceMeters, formatDistance } from "../../utils/format.js";
import { publishWikiPlaces } from "../../utils/wikiPlaces.js";
import CardSize from "../CardSize/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./wikipedia.module.css";

const NONE = [];

// The same standing-still test the food and café cards use, and the same
// figure: a hundred and fifty metres is about where the nearest few articles
// start to change places, and under that the answer is the same list off the
// same hour-old square on the server (see lookupWikipedia in server/geo.js).
const MOVED_M = 150;

// What is worth reading within a walk of here — off Wikipedia, nearest
// article first. `onOpenWikipedia` is the page's own reading sheet, the way
// the venue cards are handed the page's remarks sheet: there is a single
// place an article opens into an iframe (see HomePage), and it is opened from
// whichever surface the reader happens to be looking at, this list or the
// same place's pin on the map.
export default function WikipediaCard({ onOpenWikipedia }) {
  const { t, i18n } = useTranslation();
  const { coords, reloadToken } = useHere();
  const size = useCardSize("wikipedia");
  const cube = size === TINY;
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);
  const [anchor, setAnchor] = useState(() => coords ?? null);

  const language = i18n.language;

  useEffect(() => {
    if (!coords) return;
    setAnchor((from) => (from && distanceMeters(from, coords) < MOVED_M ? from : coords));
  }, [coords]);

  useEffect(() => {
    if (!anchor) return;
    const ticket = ++requestRef.current;
    api
      .getWikipedia(anchor)
      .then((data) => {
        if (ticket !== requestRef.current) return;
        setResult(data);
        setError(null);
      })
      .catch((requestError) => {
        if (ticket !== requestRef.current) return;
        setError(requestError);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, language, reloadToken]);

  const items = result?.items ?? NONE;

  // The same rows, on the ground — published rather than handed up, for the
  // reason the venue cards' are (see utils/wikiPlaces.js).
  useEffect(() => {
    publishWikiPlaces(items);
  }, [items]);

  useEffect(() => () => publishWikiPlaces(null), []);

  let body;
  if (error) {
    body = <p className={styles.empty}>{t("wikipedia.unavailable")}</p>;
  } else if (!result) {
    body = <Skeleton rows={4} label={t("wikipedia.loading")} />;
  } else if (items.length === 0) {
    body = (
      <p className={styles.empty}>{t("wikipedia.empty", { distance: formatDistance(result.radius) })}</p>
    );
  } else {
    body = (
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" className={styles.item} onClick={() => onOpenWikipedia?.(item)}>
              <span className={styles.name}>{item.title}</span>
              <span className={styles.distance}>{formatDistance(item.distance)}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card
      title={t("wikipedia.title")}
      meta={cube ? null : result?.place?.name}
      action={<CardSize id="wikipedia" />}
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
