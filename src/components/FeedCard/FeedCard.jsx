import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card } from "../../ui/index.js";
import { formatDistance, relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./feed.module.css";

// Both feeds are city-wide questions, so the request is keyed a decimal place
// coarser than the weather — one number, about 11 km.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(1)},${coords.longitude.toFixed(1)}`;
}

// Headlines and what-is-on are the same kind of answer about the same place, and
// they were the only two panels on the page long enough to scroll — so they
// share one, and the tab decides which list is showing.
const TABS = [
  { id: "news", ns: "nearby", fetch: api.getNearby },
  { id: "events", ns: "events", fetch: api.getEvents },
];

// One request state per tab, so a tab keeps its answer while the other is being
// read. `active` gates the fetch: a tab nobody has opened is never asked for.
function useFeed(fetch, coords, active, language) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const key = coordKey(coords);

  useEffect(() => {
    if (!coords || !active) return;
    const ticket = ++requestRef.current;
    setLoading(true);
    fetch(coords)
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
  }, [key, language, active]);

  return { result, error, loading };
}

export default function FeedCard() {
  const { t, i18n } = useTranslation();
  const { coords } = useHere();
  const [tab, setTab] = useState(TABS[0].id);
  // Opening a tab is what puts it on the wire, and it stays on it: coming back
  // to a tab must not cost another request, but a new fix or language still
  // makes both answers stale.
  const [opened, setOpened] = useState({ [TABS[0].id]: true });
  const panelId = useId();

  const language = i18n.language;
  const feeds = {
    news: useFeed(api.getNearby, coords, opened.news === true, language),
    events: useFeed(api.getEvents, coords, opened.events === true, language),
  };

  const active = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  const { result, error, loading } = feeds[active.id];
  const items = result?.items ?? [];

  let body;
  if (loading && items.length === 0) {
    body = <p className={styles.empty}>{t(`${active.ns}.loading`)}</p>;
  } else if (error) {
    body = <p className={styles.empty}>{t(`${active.ns}.unavailable`)}</p>;
  } else if (items.length === 0) {
    body = <p className={styles.empty}>{t(`${active.ns}.empty`)}</p>;
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

  // The newswire answers with articles; when it has nothing for this corner of
  // the map the server sends Wikipedia's nearby places instead, which is the one
  // thing the header still has to say — the place itself is already named once
  // at the top of the page.
  const places = active.id === "news" && items[0]?.kind === "place";

  return (
    <Card
      title={t("feed.title")}
      meta={places ? t("nearby.places") : null}
      action={
        <div className={styles.tabs} role="tablist" aria-label={t("feed.label")}>
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`${panelId}-${entry.id}`}
              aria-selected={entry.id === tab}
              aria-controls={panelId}
              className={entry.id === tab ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              onClick={() => {
                setTab(entry.id);
                setOpened((current) => ({ ...current, [entry.id]: true }));
              }}
            >
              {t(`${entry.ns}.title`)}
            </button>
          ))}
        </div>
      }
      wide
      flush
    >
      <div
        className={styles.scroll}
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${panelId}-${active.id}`}
      >
        {body}
      </div>
    </Card>
  );
}
