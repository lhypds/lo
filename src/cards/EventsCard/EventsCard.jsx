import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, PageModal, Skeleton, sheetLink } from "../../ui/index.js";
import { LARGE, SMALL, TALL, TINY, useCardSize } from "../../utils/cards.js";
import { relativeTime } from "../../utils/format.js";
import CardSize from "../../components/CardSize/index.js";
import { useHere } from "../../components/LocationProvider/index.js";
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
  // From one square up to six, like the news: a fortnight of what is on is a
  // longer list than any of those rungs holds, so which of them it is worth is
  // the reader's answer (see utils/cards.js). It arrives at the bottom one, as
  // every tile on this dashboard does.
  const size = useCardSize("events");
  // The bottom rung, where the panel stands among the opening squares rather
  // than across the column — the shape of the tile, what its heading has room
  // for, and how a row is cut, all in one word (see events.module.css).
  const cube = size === TINY;
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // Waiting from the first render, not from the first effect: with a fix in hand
  // the request below is as good as sent, and starting at false would show
  // "nothing on" for the frame in between — a card that answers before it asks.
  const [loading, setLoading] = useState(() => Boolean(coords));
  // The listing the reader is on, read over the dashboard. See ui/PageModal.
  const [reading, setReading] = useState(null);
  // The rows that turned out to have no reading behind them, found out by this
  // reader a moment ago rather than by the server half an hour ago. Same as on
  // the news panel, and for the same reason (see NewsCard).
  const [unreadable, setUnreadable] = useState(() => new Set());
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
        {items.map((item) => {
          // A listing lo cannot read is a row that goes out to the site it came
          // off, and says so before it is pressed rather than after (see the
          // same three lines on the news panel).
          const away = item.readable === false || unreadable.has(item.url);
          return (
            <li key={item.url}>
              <a
                {...(away
                  ? { href: item.url, target: "_blank", rel: "noreferrer noopener" }
                  : sheetLink(item.url, () => setReading(item)))}
                className={away ? `${styles.item} ${styles.away}` : styles.item}
              >
                {away && (
                  <span className={styles.mark}>
                    <span aria-hidden="true">↗</span>
                    <span className="sr-only">{t("reader.away")}</span>
                  </span>
                )}
                <span className={styles.itemTitle}>{item.title}</span>
                <span className={styles.itemMeta}>
                  <span className={styles.source}>{item.source}</span>
                  {item.time && <time dateTime={item.time}>{relativeTime(item.time, language, t)}</time>}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card
      title={t("events.title")}
      // How many listings there are, as on the news panel beside it and every
      // other list on the page. The place name that stood here before was a
      // label rather than a claim — every row under it is about here anyway —
      // and it was already dropped on a cube; the count is worth having at
      // every size, and it is short enough that a cube can hold it too. Nothing
      // rather than a nought: the line under the heading says "nothing on".
      meta={items.length || null}
      action={<CardSize id="events" />}
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
      <PageModal
        url={reading?.url}
        title={reading?.title}
        source={reading?.source}
        time={reading?.time}
        kind="event"
        onUnreadable={(url) => setUnreadable((known) => new Set(known).add(url))}
        onClose={() => setReading(null)}
      />
    </Card>
  );
}
