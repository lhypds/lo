import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Modal, Skeleton } from "../../ui/index.js";
import { SMALL, LARGE, TALL, TINY, useCardSize } from "../../utils/cards.js";
import { distanceMeters, formatDistance } from "../../utils/format.js";
import { directionsLink, searchLink } from "../../utils/maps.js";
import { publishHistoryPlaces, updateHistoryComments, useHistoryPlaces } from "../../utils/historyPlaces.js";
import CardSize from "../../components/CardSize/index.js";
import { useHere } from "../../components/LocationProvider/index.js";
import styles from "./history.module.css";

const NONE = [];

// The same standing-still test the wikipedia card uses, and the same figure —
// under a hundred metres the answer is the same list off the same day-old
// square on the server (see lookupHistory in server/geo.js).
const MOVED_M = 100;

// What this ground used to look like — the photographs taken here long enough
// ago to be a different here, off Wikimedia Commons, oldest first. Row for row
// the wikipedia card's own shape (see WikipediaCard, which this copies the way
// that card copies VenuesCard), with one figure added at the left of every row
// and the top of every preview: the year, which on this card is the reading.
// `onOpenComments` and `onOpenPhoto` are handed down exactly as that card's
// are — an old photograph of the street is somewhere lo's readers can leave a
// word, and pressing the picture puts it up in the page's one Lightbox.
export default function HistoryCard({ onOpenComments = null, onOpenPhoto = null }) {
  const { t, i18n } = useTranslation();
  const { coords, reloadToken } = useHere();
  const size = useCardSize("history");
  const cube = size === TINY;
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);
  const [open, setOpen] = useState(null);
  const [anchor, setAnchor] = useState(() => coords ?? null);

  // The photographs are in no language, but the place name on the heading is
  // in the reader's — the language is a dependency for that one field, and the
  // server's caches make the re-ask a recombination rather than a re-scan.
  const language = i18n.language;

  useEffect(() => {
    if (!coords) return;
    setAnchor((from) => (from && distanceMeters(from, coords) <= MOVED_M ? from : coords));
  }, [coords]);

  useEffect(() => {
    if (!anchor) return;
    const ticket = ++requestRef.current;
    api
      .getHistory(anchor)
      .then((data) => {
        if (ticket !== requestRef.current) return;
        setResult(data);
        setError(null);
        setOpen(null);
      })
      .catch((requestError) => {
        if (ticket !== requestRef.current) return;
        setError(requestError);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, language, reloadToken]);

  const items = result?.items ?? NONE;

  // The same rows, pinned where each camera stood — published rather than
  // handed up, for the reason the wikipedia card's are (see
  // utils/historyPlaces.js).
  useEffect(() => {
    publishHistoryPlaces(items);
  }, [items]);

  useEffect(() => () => publishHistoryPlaces(null), []);

  // Read back for the one field that can change under a row that has already
  // landed: the count in the corner.
  const published = useHistoryPlaces();
  const counts = useMemo(() => new Map(published.map((row) => [row.id, row.comments])), [published]);

  let body;
  if (error) {
    body = <p className={styles.empty}>{t("history.unavailable")}</p>;
  } else if (!result) {
    body = <Skeleton rows={4} label={t("history.loading")} />;
  } else if (items.length === 0) {
    body = (
      <p className={styles.empty}>{t("history.empty", { distance: formatDistance(result.radius) })}</p>
    );
  } else {
    body = (
      <ul className={styles.list}>
        {items.map((item) => {
          const comments = counts.get(item.id) ?? item.comments ?? 0;
          return (
            <li key={item.id}>
              <button type="button" className={styles.item} onClick={() => setOpen(item.id)}>
                {item.thumbnail && (
                  <img className={styles.thumb} src={item.thumbnailSmall || item.thumbnail} alt="" loading="lazy" />
                )}
                {/* The year leads the row rather than trailing it with the
                    distance: down this list it is the thing that changes, and
                    the reason any of these rows earned their place. */}
                <span className={styles.year}>{item.year}</span>
                <span className={styles.name}>{item.title}</span>
                <span className={styles.figures}>
                  <span className={styles.distance}>{formatDistance(item.distance)}</span>
                  {comments > 0 && (
                    <span className={styles.comments}>
                      {t("comments.venueShort")} {comments}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const chosen = open ? (items.find((item) => item.id === open) ?? null) : null;

  return (
    <Card
      title={t("history.title")}
      // How many moments this place has on record rather than its name — see
      // VenuesCard, whose corner this is kept in step with.
      meta={items.length || null}
      action={<CardSize id="history" />}
      wide={!cube}
      half={size === SMALL}
      square={size === LARGE || cube}
      tall={size === TALL}
      flush
      className={cube ? styles.square : undefined}
    >
      <div className={styles.scroll}>{body}</div>
      {/* The preview a row or a pin opens — the wikipedia card's sheet with the
          year on the meta line, and the way out labelled with Commons, where
          the photograph's page carries what a card cannot: the uploader, the
          licence, and the full size. */}
      {createPortal(
        <Modal
          isOpen={Boolean(chosen)}
          title={t("history.title")}
          onClose={() => setOpen(null)}
          closeOnOverlay
          header={
            chosen && (
              <a
                className={styles.away}
                href={chosen.url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`${t("history.open")} ${chosen.title}`}
              >
                {chosen.source || t("history.open")}
                <span aria-hidden="true"> ↗</span>
              </a>
            )
          }
        >
          {chosen && (
            <div className={styles.preview}>
              {chosen.thumbnail &&
                (onOpenPhoto ? (
                  <button
                    type="button"
                    className={styles.previewPhoto}
                    aria-label={t("post.photoOpen")}
                    onClick={() => onOpenPhoto(chosen)}
                  >
                    <img className={styles.previewImage} src={chosen.thumbnail} alt="" loading="lazy" />
                  </button>
                ) : (
                  <img className={styles.previewImage} src={chosen.thumbnail} alt="" loading="lazy" />
                ))}
              <p className={styles.previewName}>{chosen.title}</p>
              {chosen.description && <p className={styles.previewSummary}>{chosen.description}</p>}
              <span className={styles.previewMeta}>{`${chosen.year} · ${formatDistance(chosen.distance)}`}</span>
              <div className={styles.actions}>
                <span className={styles.group}>
                  {/* The same pair of hand-offs to Maps every other card's sheet
                      carries, in the same order: what is standing there, then
                      the walk to it. Searched on the coordinates alone and not
                      on the heading above — a photograph's title is its caption
                      or its filename, and neither is a query Google Maps can be
                      asked. Which is the question this card raises more sharply
                      than any other: the picture says what stood on this ground
                      once, and the search says what stands on it now. */}
                  <a
                    className={styles.action}
                    aria-label={`${t("map.search")} ${chosen.title}`}
                    {...searchLink(chosen)}
                  >
                    {t("map.search")}
                  </a>
                  <a
                    className={styles.action}
                    aria-label={`${t("map.nav")} ${chosen.title}`}
                    {...directionsLink(chosen, coords)}
                  >
                    {t("map.nav")}
                  </a>
                </span>
                {onOpenComments && (
                  <button
                    type="button"
                    className={styles.action}
                    aria-label={`${t("comments.venueShort")} ${chosen.title}`}
                    onClick={() => {
                      setOpen(null);
                      onOpenComments(chosen);
                    }}
                  >
                    {t("comments.venueShort")} {counts.get(chosen.id) ?? chosen.comments ?? 0}
                  </button>
                )}
              </div>
            </div>
          )}
        </Modal>,
        document.body,
      )}
    </Card>
  );
}
