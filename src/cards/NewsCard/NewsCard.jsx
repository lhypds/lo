import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, PageModal, Skeleton, sheetLink } from "../../ui/index.js";
import { LARGE, SMALL, TALL, TINY, useCardSize } from "../../utils/cards.js";
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
  // One square like every other panel, until the reader gives it two, four or
  // six. The wire comes back with more rows than even three tiles hold, so every
  // rung of the ladder is a window onto the same scroll (see utils/cards.js).
  const size = useCardSize("nearby");
  // The bottom rung, where the panel stands among the opening squares rather
  // than across the column — the shape of the tile, what its heading has room
  // for, and how a row is cut, all in one word (see news.module.css).
  const cube = size === TINY;
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // Waiting from the first render, not from the first effect: with a fix in
  // hand the request below is already as good as sent, and starting at false
  // would show "nothing to report" for the frame in between — a card that
  // answers before it has asked.
  const [loading, setLoading] = useState(() => Boolean(coords));
  // The story the reader is on, read in a sheet over the dashboard rather than
  // in a tab that takes the dashboard's place. See ui/PageModal.
  const [reading, setReading] = useState(null);
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
            {/* A story opens into its own words; a place opens Wikipedia. The
                fallback rows are not news and lo keeps no reading for them —
                and unlike a newspaper, Wikipedia is a page worth arriving at. */}
            <a
              {...(item.kind === "place"
                ? { href: item.url, target: "_blank", rel: "noreferrer noopener" }
                : sheetLink(item.url, () => setReading(item)))}
              className={styles.item}
            >
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
      // The one heading on the dashboard that keeps its meta on a cube, because
      // this one is a claim and not a label: "Local" and "Around you" are the
      // difference between headlines from here and a list of what happens to be
      // standing nearby, and the row that used to say which — the publisher — is
      // the very thing a cube drops. The place name behind it is a label, so it
      // goes the way the others do.
      meta={items.length > 0 ? t(`news.${kind}`) : cube ? null : result?.place?.name}
      action={<CardSize id="nearby" />}
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
        kind="news"
        onClose={() => setReading(null)}
      />
    </Card>
  );
}
