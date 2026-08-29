import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Skeleton } from "../../ui/index.js";
import { LARGE, SMALL, TALL, TINY, useCardSize } from "../../utils/cards.js";
import { formatDistance } from "../../utils/format.js";
import { directionsLink } from "../../utils/maps.js";
import { publishVenues, venueParts } from "../../utils/venues.js";
import CardSize from "../CardSize/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./venues.module.css";

// Which address answers for which card. The kind is the one word the whole app
// knows these two by — the card in the layout, the component the country list is
// asked about, the address on the server and the stem of every word on the tile
// — so there is nothing here to keep in step with anything else.
const FETCH = { food: api.getFood, cafe: api.getCafes };

// One array for every empty answer, so that the rows this card publishes to the
// map keep the same identity while there is nothing to publish (see
// utils/venues.js, where the same reasoning is spelled out).
const NONE = [];

// Unlike the news beside it, this list goes stale the moment the reader walks:
// the rows are sorted by how far off they are and the distances are measured
// from the fix itself. Three decimals is ~110 m, which is about the distance at
// which the order of the nearest few actually changes. Standing still asks for
// nothing; walking a block asks again, and the server answers that out of the
// same list it already had (see lookupVenues in server/geo.js).
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(3)},${coords.longitude.toFixed(3)}`;
}

// The one panel lo draws twice. Somewhere to eat and somewhere for a coffee are
// the same question asked about two sets of amenities — the same rows, the same
// sort, the same empty sentence with a different noun in it — and the only thing
// that differs is which of them the reader wanted on the page. So it is written
// once here and named twice (see FoodCard and CafeCard), which is what stops a
// change to the shape of a row from having to be made in two places and getting
// made in one.
export default function VenuesCard({ kind }) {
  const { t, i18n } = useTranslation();
  const { coords, reloadToken } = useHere();
  // A list as long as the street is, in a tile the reader sizes from a single
  // square to six — and it arrives as the single square, among the tiles the
  // dashboard opens with rather than as a strip across the column. The nearest
  // three or four is very often the whole of what "where is the closest coffee"
  // was asking, and that is a glance rather than a column; a reader who wants
  // the street rather than the corner has three rungs above it to say so.
  const size = useCardSize(kind);
  // The bottom rung, where the panel stands among the opening squares rather
  // than across the column. Worth naming because it is three answers at once:
  // the shape of the tile, what its heading has room for, and how a row is cut
  // (see venues.module.css).
  const cube = size === TINY;
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const key = coordKey(coords);
  const language = i18n.language;

  useEffect(() => {
    if (!coords) return;
    const ticket = ++requestRef.current;
    FETCH[kind](coords)
      .then((data) => {
        if (ticket !== requestRef.current) return;
        setResult(data);
        setError(null);
      })
      .catch((requestError) => {
        if (ticket !== requestRef.current) return;
        setError(requestError);
      });
    // The rounded key and the language are the only things that make this a
    // different question — and the token, which is the reader asking again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key, language, reloadToken]);

  const items = result?.items ?? NONE;

  // The same rows, on the ground. Published rather than handed up, because the
  // map is not this card's parent and has no business being one — see
  // utils/venues.js.
  useEffect(() => {
    publishVenues(kind, items);
  }, [kind, items]);

  // And cleared when the tile goes, so a card the reader has put away takes its
  // pins with it. Its own effect and not the one above's cleanup: that one runs
  // on every new list as well, which would take all the pins off the map and put
  // them back for a redraw that only ever moved them.
  useEffect(() => () => publishVenues(kind, null), [kind]);

  // No `loading` flag, unlike the panels beside this one, because there is
  // nothing here it would be needed to tell apart: an answer is a list or it is
  // an empty one, and both of those arrive in `result`. Anything before that —
  // the request in the air, or no fix yet to send with it — is the same state,
  // which is that the tile has not been answered, and a tile that has not been
  // answered puts its bars up.
  //
  // Which is also what keeps the empty sentence honest. It names the distance
  // that was actually searched, and it can only do that once the search has
  // come back and said how far it went.
  let body;
  if (error) {
    body = <p className={styles.empty}>{t(`${kind}.unavailable`)}</p>;
  } else if (!result) {
    body = <Skeleton rows={4} label={t(`${kind}.loading`)} />;
  } else if (items.length === 0) {
    // How far lo actually looked is the server's answer and not a figure this
    // card should be assuming: a place with nothing near it widens the search
    // before giving up, so the sentence names the ring that really came back
    // empty rather than the one it started with.
    body = (
      <p className={styles.empty}>{t(`${kind}.empty`, { distance: formatDistance(result.radius) })}</p>
    );
  } else {
    body = (
      <ul className={styles.list}>
        {items.map((item) => {
          const { category, cuisine } = venueParts(item, t);
          return (
            <li key={item.id}>
              {/* The row is the way there: the same anchor the marks list uses,
                  which hands a handheld to its maps app and a desktop to the
                  directions page rather than drawing a line lo cannot follow. */}
              <a {...directionsLink(item, coords)} className={styles.item}>
                <span className={styles.body}>
                  <span className={styles.name}>{item.name}</span>
                  {/* Left off rather than left empty on the rows that have
                      neither word to say, so a name is not carrying a blank
                      line that the rows around it are using. */}
                  {(category || cuisine) && (
                    <span className={styles.meta}>
                      {category && <span>{category}</span>}
                      {cuisine && <span>{cuisine}</span>}
                    </span>
                  )}
                </span>
                {/* The sort key, out in a column of its own on the right: a
                    list ordered by distance should read as one down its edge. */}
                <span className={styles.distance}>{formatDistance(item.distance)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card
      title={t(`${kind}.title`)}
      // Dropped on a cube, where the heading is sharing one column with the pair
      // of size buttons: the place name is the line that can go, because every
      // row under it is already carrying a distance from here, and a tile among
      // tiles that are all about here does not have to say so twice.
      meta={cube ? null : result?.place?.name}
      action={<CardSize id={kind} />}
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
