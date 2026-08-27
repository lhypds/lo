import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Skeleton } from "../../ui/index.js";
import { LARGE, SMALL, TALL, useCardSize } from "../../utils/cards.js";
import { relativeTime } from "../../utils/format.js";
import CardSize from "../CardSize/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./events.module.css";

// What is on is a city-wide question, like the news: one decimal place, ~11 km.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(1)},${coords.longitude.toFixed(1)}`;
}

// A panel of its own again, beside the news rather than mixed into it. Both
// answers do come off the same newswire — what is on this week is a news search
// with the word for "event" in it — which was the argument for one card, and the
// argument against it is the reader: "what is happening here" and "what is on
// here" are two questions, and a list that answers both answers whichever one
// you were not asking in most of its rows. Two panels, either of which can be
// taken off the page on its own (see utils/cards.js), let the reader keep the
// question they came with.
export default function EventsCard() {
  const { t, i18n } = useTranslation();
  const { coords, reloadToken } = useHere();
  // Up to six squares like the news, and for the same reason: a week's worth of
  // what is on is a longer list than two tiles hold (see utils/cards.js). It stays
  // in the right-hand column at every one of them — it is the news that moves.
  const size = useCardSize("events");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // Waiting from the first render, not from the first effect: with a fix in hand
  // the request below is as good as sent, and starting at false would show
  // "nothing on" for the frame in between — a card that answers before it asks.
  const [loading, setLoading] = useState(() => Boolean(coords));
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
    // language are the only things that make this a different question — and the
    // token, which is the reader asking for it again anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, language, reloadToken]);

  const items = result?.items ?? [];

  let body;
  if (loading && items.length === 0) {
    body = <Skeleton rows={3} label={t("events.loading")} />;
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
    <Card
      title={t("events.title")}
      meta={result?.place?.name}
      action={<CardSize id="events" />}
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
