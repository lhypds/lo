import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Skeleton } from "../../ui/index.js";
import { formatDistance, relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./news.module.css";

// Local news is a city-wide question, so the request is keyed a decimal place
// coarser than the weather — one number, about 11 km.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(1)},${coords.longitude.toFixed(1)}`;
}

// One card off two feeds. They were two before, and the split was never really
// about the reader: both answers come back off the same newswire — what is on
// this week is a news search with the word for "event" in it — so the two cards
// carried the same kind of row, in the same shape, one under the other. Read as
// one list they are what the place is talking about, which was the question in
// both cases.
//
// Which of them a country has is still the server's answer, so an edition that
// only covers one of the two is read for that one alone rather than counted as
// half a failure.
//
// Merging the two cost the reader the one thing the split did tell them: which
// rows were the answer to "what is on". A feed with a `tag` puts that back as a
// word on the row itself — the plain newswire has none, because "news" is what
// the card is called and a label saying so would be on every row.
const FEEDS = [
  { component: "nearby", fetch: api.getNearby },
  { component: "events", fetch: api.getEvents, tag: "events" },
];

// The same story from both feeds is one story — an article about a festival is
// news as well as an event, and the newswire hands it over twice. The server
// dedupes within a feed; across the two, the URL is the same article.
function merge(replies) {
  const byUrl = new Map();
  const items = [];
  for (const { feed, answer } of replies) {
    for (const item of answer?.items ?? []) {
      const kept = byUrl.get(item.url);
      // A story the plain feed got to first is still an event if the events
      // feed also carries it — the label follows the story, not the order the
      // two answers happened to arrive in.
      if (kept) {
        if (feed.tag) kept.tag = feed.tag;
        continue;
      }
      const tagged = { ...item, tag: feed.tag ?? null };
      byUrl.set(item.url, tagged);
      items.push(tagged);
    }
  }
  // Newest first, which is the order each feed already arrives in and the only
  // one the two have in common. Anything undated goes last rather than to the
  // top: Wikipedia's places have no time at all, and they are the answer of last
  // resort in any case.
  return items.sort((a, b) => (b.time ? Date.parse(b.time) : 0) - (a.time ? Date.parse(a.time) : 0));
}

export default function NewsCard() {
  const { t, i18n } = useTranslation();
  const { coords, supports, reloadToken } = useHere();
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
  // Read into the effect, which is not allowed to depend on it: `supports` is
  // rebuilt on every render of the provider, and the answer it gives only
  // changes when the fix crosses a border — which is a new `key` anyway.
  const feeds = FEEDS.filter((feed) => supports(feed.component));
  const feedsRef = useRef(feeds);
  feedsRef.current = feeds;

  useEffect(() => {
    if (!coords) return;
    const ticket = ++requestRef.current;
    setLoading(true);
    // Both at once, and one that fails is not the other's failure: a card with
    // the events feed down still has the news to show, and only a card with
    // nothing at all to show says so.
    Promise.all(
      feedsRef.current.map((feed) =>
        feed.fetch(coords).then(
          (answer) => ({ feed, answer }),
          (requestError) => ({ feed, failed: requestError }),
        ),
      ),
    ).then((replies) => {
      if (ticket !== requestRef.current) return;
      const answered = replies.filter((reply) => !reply.failed);
      setResult(
        answered.length > 0
          ? {
              items: merge(answered),
              place: answered.find((reply) => reply.answer?.place)?.answer.place ?? null,
            }
          : null,
      );
      setError(answered.length > 0 ? null : (replies[0]?.failed ?? null));
      setLoading(false);
    });
    // The fix jitters constantly; the rounded key and the language are the only
    // things that make this a different question — and the token, which is the
    // reader saying they want the answer again regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, language, reloadToken]);

  const items = result?.items ?? [];
  // The newswire answers with articles; when it has nothing for this corner of
  // the map the server sends Wikipedia's nearby places instead, and the heading
  // follows. A place among articles is not that case — the two feeds are merged,
  // so it takes a list with no article in it at all.
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
                {item.tag && <span className={styles.tag}>{t(`news.tags.${item.tag}`)}</span>}
                {Number.isFinite(item.distance) && <span>{formatDistance(item.distance)}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  // `panel-lead` is the page's hook for the first of the big panels — on a wide
  // screen it is pinned to the right of the square tiles, and the rest of the
  // grid flows around it. Global on purpose, like the map's `map-full`.
  return (
    <Card
      title={t("news.title")}
      meta={items.length > 0 ? t(`news.${kind}`) : result?.place?.name}
      wide
      square
      flush
      className="panel-lead"
    >
      <div className={styles.scroll}>{body}</div>
    </Card>
  );
}
