import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Skeleton } from "../../ui/index.js";
import { LARGE, SMALL, TALL, useCardSize } from "../../utils/cards.js";
import { formatDistance, relativeTime } from "../../utils/format.js";
import CardSize from "../CardSize/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./news.module.css";

// Local news is a city-wide question, so the request is keyed a decimal place
// coarser than the weather — one number, about 11 km.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(1)},${coords.longitude.toFixed(1)}`;
}

// The newswire alone. What is on this week is its own panel again — the two were
// one card for a while, and what that cost was the reader's question: somebody
// who came to the dashboard to find out what is happening around here got a list
// with half its rows answering something else, and somebody looking for
// something to go to got the same list from the other side. Both feeds do come
// off the same upstream, which is what made merging them look free; it is not a
// reason for one card, only for two that are cheap. See EventsCard.
export default function NewsCard() {
  const { t, i18n } = useTranslation();
  const { coords, reloadToken } = useHere();
  // Two squares like every other panel, until the reader gives it four or six.
  // The wire comes back with more rows than even three tiles hold, so every rung
  // of the ladder is a window onto the same scroll (see utils/cards.js) — and this
  // is the only card whose place on a wide grid changes with its height, see the
  // class below.
  const size = useCardSize("nearby");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // Waiting from the first render, not from the first effect: with a fix in
  // hand the request below is already as good as sent, and starting at false
  // would show "nothing to report" for the frame in between — a card that
  // answers before it has asked.
  const [loading, setLoading] = useState(() => Boolean(coords));
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
    // things that make this a different question — and the token, which is the
    // reader saying they want the answer again regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, language, reloadToken]);

  const items = result?.items ?? [];
  // The newswire answers with articles; when it has nothing for this corner of
  // the map the server sends Wikipedia's nearby places instead, and the heading
  // follows.
  const kind = items.length > 0 && items.every((item) => item.kind === "place") ? "places" : "local";

  let body;
  if (loading && items.length === 0) {
    body = <Skeleton rows={5} label={t("news.loading")} />;
  } else if (error) {
    body = <p className={styles.empty}>{t("news.unavailable")}</p>;
  } else if (items.length === 0) {
    body = <p className={styles.empty}>{t("news.empty")}</p>;
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
                {Number.isFinite(item.distance) && <span>{formatDistance(item.distance)}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  // How much of the grid it covers is the whole of what this card says about
  // where it goes. It used to hand the page a hook as well — a class that pinned
  // it to the top of the right half on a wide screen — and that went with the
  // paging: a dashboard cut into windowfuls has no one top right for a panel to
  // be pinned to, and a row claimed by a pin is a row the page cannot count when
  // it works out where to cut (see .card-grid in styles.css, utils/pages.js).
  return (
    <Card
      title={t("news.title")}
      meta={items.length > 0 ? t(`news.${kind}`) : result?.place?.name}
      action={<CardSize id="nearby" />}
      wide
      half={size === SMALL}
      square={size === LARGE}
      tall={size === TALL}
      flush
    >
      <div className={styles.scroll}>{body}</div>
    </Card>
  );
}
