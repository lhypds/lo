import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Modal, Skeleton } from "../../ui/index.js";
import { LARGE, SMALL, TALL, TINY, useCardSize } from "../../utils/cards.js";
import { distanceMeters, formatDistance } from "../../utils/format.js";
import { directionsLink, placeSearchLink } from "../../utils/maps.js";
import { publishWikiPlaces, useWikiPlaces } from "../../utils/wikiPlaces.js";
import CardSize from "../CardSize/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./wikipedia.module.css";

const NONE = [];

// The same standing-still test the food and café cards use, and the same
// figure: a hundred and fifty metres is about where the nearest few articles
// start to change places, and under that the answer is the same list off the
// same hour-old square on the server (see lookupWikipedia in server/geo.js).
const MOVED_M = 150;

// What is worth reading within a walk of here — off Wikipedia, nearest article
// first. The preview at the foot of this file is the venue cards' own: a name,
// a picture and a lead paragraph where Wikipedia has them, how far off it is,
// and the same two hand-offs to Google Maps — plus the remarks, because a
// landmark is somewhere lo's readers can leave a word about exactly as a café
// is (see `onOpenComments`, handed down the way the venue cards are handed the
// page's own remarks sheet). `onOpenPhoto` is a post's own hand-off, reused
// rather than duplicated: pressing the picture puts it up large in the one
// Lightbox the page already keeps for a post's (see HomePage).
export default function WikipediaCard({ onOpenComments = null, onOpenPhoto = null }) {
  const { t, i18n } = useTranslation();
  const { coords, reloadToken } = useHere();
  const size = useCardSize("wikipedia");
  const cube = size === TINY;
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);
  // Which article the reader has asked about, by id, and nothing when they
  // have asked about none — the same single sheet the venue cards keep (see
  // VenuesCard).
  const [open, setOpen] = useState(null);
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
        setOpen(null);
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

  // Read back for the one field that can change under a row that has already
  // landed: the count in the corner, the way VenuesCard reads its own back off
  // utils/venues.js.
  const published = useWikiPlaces();
  const counts = useMemo(() => new Map(published.map((row) => [row.id, row.comments])), [published]);

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
        {items.map((item) => {
          const comments = counts.get(item.id) ?? item.comments ?? 0;
          return (
            <li key={item.id}>
              <button type="button" className={styles.item} onClick={() => setOpen(item.id)}>
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
      {/* The preview a pin opens on the map, said as a sheet — see VenuesCard,
          which this copies pixel for pixel bar the picture: a landmark comes
          with one where Wikipedia has one, and an OSM venue never does. */}
      {createPortal(
        <Modal isOpen={Boolean(chosen)} title={t("wikipedia.title")} onClose={() => setOpen(null)} closeOnOverlay>
          {chosen && (
            <div className={styles.preview}>
              {/* Pressed, the picture Wikipedia keeps for the page — not a
                  control where the page has nowhere to put one, the same
                  choice a post's own bubble makes (see wikiPopupElement in
                  MapCard.jsx). */}
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
              <span className={styles.previewMeta}>{formatDistance(chosen.distance)}</span>
              <div className={styles.actions}>
                <span className={styles.group}>
                  <a
                    className={styles.action}
                    aria-label={`${t("map.search")} ${chosen.title}`}
                    {...placeSearchLink({ ...chosen, name: chosen.title })}
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
