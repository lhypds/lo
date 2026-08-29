import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Skeleton } from "../../ui/index.js";
import { LARGE, SMALL, TALL, useCardSize } from "../../utils/cards.js";
import { formatDistance } from "../../utils/format.js";
import { directionsLink } from "../../utils/maps.js";
import CardSize from "../CardSize/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./venues.module.css";

// Which address answers for which card. The kind is the one word the whole app
// knows these two by — the card in the layout, the component the country list is
// asked about, the address on the server and the stem of every word on the tile
// — so there is nothing here to keep in step with anything else.
const FETCH = { food: api.getFood, cafe: api.getCafes };

// The amenities the server asks OpenStreetMap about, and nothing else: a tag lo
// has a word for is a tag lo can put on a row in the reader's language, and one
// it does not is left off rather than printed as the slug it arrived as.
const CATEGORIES = new Set(["restaurant", "fast_food", "food_court", "cafe"]);

// The two that say nothing when there is a cuisine to say instead — see below.
const PLAIN = new Set(["restaurant", "cafe"]);

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

// What a row says about itself under its name, which is at most two words wide.
//
// The cuisine leads, because it is the thing that tells one row from the next:
// down a list where nearly every line is a restaurant, "Restaurant" is the part
// carrying no information. The amenity is set beside it only where it carries
// some of its own — a counter you eat at standing up is a different evening from
// a table you sit down at — and otherwise stands in for a cuisine nobody has
// filled in.
//
// The cuisine itself is left in the words the mappers wrote it in, less the
// underscores, which are the file format showing through. There is no closed
// list of them to translate against, and a guessed translation of somebody's
// kitchen is worse than their own plain word for it.
function rowParts(item, t) {
  const cuisine = (item.cuisine || "").replace(/_/g, " ");
  const named = CATEGORIES.has(item.category);
  const shown = named && (!cuisine || !PLAIN.has(item.category));
  return { category: shown ? t(`venues.category.${item.category}`) : "", cuisine };
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
  // A list as long as the street is, in a tile the reader sizes from two squares
  // to six — the same ladder every panel that holds a list gets. At the smallest
  // it is a window onto the nearest three or four, which for "where is the
  // closest coffee" is very often the whole answer.
  const size = useCardSize(kind);
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

  const items = result?.items ?? [];

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
          const { category, cuisine } = rowParts(item, t);
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
      meta={result?.place?.name}
      action={<CardSize id={kind} />}
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
