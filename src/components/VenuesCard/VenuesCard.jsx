import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Modal, Skeleton } from "../../ui/index.js";
import { LARGE, SMALL, TALL, TINY, useCardSize } from "../../utils/cards.js";
import { distanceMeters, formatDistance } from "../../utils/format.js";
import { directionsLink, placeSearchLink } from "../../utils/maps.js";
import { publishVenues, useVenues, venueParts } from "../../utils/venues.js";
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

// How far the reader has to have actually gone before this list is worth asking
// for again. Unlike the news beside it, this one does go stale by walking: the
// rows are sorted by how far off they are and the distances are measured from
// the fix. But it goes stale by walking and by nothing else — a hundred and
// fifty metres is about where the order of the nearest few starts to change,
// and under that the answer is the same names in the same order, off the same
// hour-old square on the server (see lookupVenues in server/geo.js).
//
// Measured from where the list on screen was asked from, rather than by rounding
// each fix to a grid and watching for the square to change. A grid is only a
// stand-in for distance and a poor one at the edges: a phone sitting still on a
// table reads a slightly different pair of numbers every thirty seconds, and a
// table that happens to be a few metres from a boundary would have every one of
// those twitches count as having moved.
const MOVED_M = 150;

// The one panel lo draws twice. Somewhere to eat and somewhere for a coffee are
// the same question asked about two sets of amenities — the same rows, the same
// sort, the same empty sentence with a different noun in it — and the only thing
// that differs is which of them the reader wanted on the page. So it is written
// once here and named twice (see FoodCard and CafeCard), which is what stops a
// change to the shape of a row from having to be made in two places and getting
// made in one.
//
// `onOpenComments` is the page's venue sheet, handed down the way the map is
// handed the same one: there is a single conversation about a place, and it is
// opened from whichever of the two surfaces the reader happens to be looking at.
// Without it the preview keeps its two hand-offs to Google Maps and drops the
// third word, which is what a card rendered somewhere with no sheet to open
// should do.
export default function VenuesCard({ kind, onOpenComments = null }) {
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
  // Which place the reader has asked about, by id, and nothing when they have
  // asked about none. The sheet it opens is over the whole window rather than
  // hanging off the row, so one at a time is not a rule this has to keep — it is
  // the only shape the answer has.
  const [open, setOpen] = useState(null);
  // The fix this card is standing on: the one the list below was asked from,
  // which is not the one the sensor last read. Seeded from the fix that is
  // already in hand, so a card mounting with a position asks its question on the
  // first pass rather than a render later.
  const [anchor, setAnchor] = useState(() => coords ?? null);

  const language = i18n.language;

  // Has the reader gone anywhere? The fix arrives again every thirty seconds
  // whether they have or not, so this is where standing still is told from
  // walking, and it is the whole of what keeps the card from re-asking a
  // question whose answer cannot have changed. Returning the old anchor is
  // returning the same object, which React reads as nothing having happened.
  useEffect(() => {
    if (!coords) return;
    setAnchor((from) => (from && distanceMeters(from, coords) < MOVED_M ? from : coords));
  }, [coords]);

  useEffect(() => {
    if (!anchor) return;
    const ticket = ++requestRef.current;
    FETCH[kind](anchor)
      .then((data) => {
        if (ticket !== requestRef.current) return;
        setResult(data);
        setError(null);
        // And the preview down with the list it was opened from. A new answer
        // here is the reader having walked a hundred and fifty metres or having
        // asked again, and the place the sheet is about need not be in the list
        // that just landed at all.
        setOpen(null);
      })
      .catch((requestError) => {
        if (ticket !== requestRef.current) return;
        setError(requestError);
      });
    // The anchor and the language are the only things that make this a different
    // question — and the token, which is the reader asking again. That one asks
    // from the anchor rather than from wherever they are standing at the moment
    // they press it: within the distance above the two are the same list, and
    // re-anchoring here as well would put a second request in the air behind
    // this one for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, anchor, language, reloadToken]);

  const items = result?.items ?? NONE;

  // The same rows, on the ground. Published rather than handed up, because the
  // map is not this card's parent and has no business being one — see
  // utils/venues.js.
  useEffect(() => {
    publishVenues(kind, items);
  }, [kind, items]);

  // And read back, for one field only: the number of remarks under a place. A
  // comment written from a bubble on the map is put straight into that store so
  // the pin is redrawn with the new figure (see updateVenueComments), and the
  // row down here is the same place — two counts that disagree would be lo
  // arguing with itself until this list is next asked for, which is not until
  // the reader has walked a hundred and fifty metres.
  //
  // An overlay rather than rendering the published rows outright: those are
  // written by an effect, so for one paint after an answer lands they are still
  // the previous list — and on the first answer of all, they are none, which
  // would flash the empty sentence over a list that had just arrived. The rows
  // stay this card's own and only the figure comes from the shelf.
  const published = useVenues();
  const counts = useMemo(
    () => new Map(published.map((row) => [row.id, row.comments])),
    [published],
  );

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
          const comments = counts.get(item.id) ?? item.comments ?? 0;
          const away = formatDistance(item.distance);
          return (
            <li key={item.id}>
              {/* The row is a press rather than a way anywhere, and what it
                  opens is the preview at the foot of this file — the same one
                  the pin for this place opens on the map, because it is the same
                  place and there is no sense in two answers to one press. What
                  it costs is the row's old job of being the directions link;
                  what it buys is everything that could not be fitted onto a row,
                  which on a tile ninety pixels across was all three of them. */}
              <button
                type="button"
                className={styles.item}
                aria-haspopup="dialog"
                onClick={() => setOpen(item.id)}
              >
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
                {/* The two figures about a place that are not the place, out on
                    the right: how far off it is, which is the sort key and reads
                    down the edge as the ladder it is, and how much has been said
                    about it, which is the one thing on the row that says the
                    preview has something in it worth opening.
                    A nought is left off, as it is on a post's row and unlike in
                    the preview: there the figure is a control and the nought is
                    an invitation to be the first to say something, here it would
                    be "comments 0" written down every row of a quiet street. */}
                <span className={styles.figures}>
                  <span className={styles.distance}>{away}</span>
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

  // The place the preview is about, looked up rather than held: what the reader
  // pressed is a row of the list on screen, and the list on screen is the one
  // thing here that is allowed to be replaced under them. Holding the row itself
  // would be holding a copy of it, which is how a sheet comes to be showing a
  // distance measured from a street the reader left.
  const chosen = open ? (items.find((item) => item.id === open) ?? null) : null;
  const chosenParts = chosen ? venueParts(chosen, t) : null;
  const serves = chosenParts
    ? [chosenParts.category, chosenParts.cuisine].filter(Boolean).join(" · ")
    : "";

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
      {/* Out to the body, for the reason the mark button gives where it does the
          same (see MarkButton): the tile is a query container, and containment
          makes it the containing block for anything fixed inside it — a sheet
          left in here would be laid out across this one square and greyed out
          the card rather than the window.

          The preview a pin opens on the map, said as a sheet: in the middle of
          the screen with the dashboard dimmed behind it, because a card is a
          tile among tiles and a bubble hanging off a row of one is a box the
          reader has to find. What it says is what the bubble says, in the same
          order — the name at the head, what it serves, how far off it is, and
          then everything there is to do about it on a line at the foot. */}
      {createPortal(
        <Modal
          isOpen={Boolean(chosen)}
          // Which list this place came out of, rather than the place itself. The
          // sheet's own title is one line that never wraps and is cut with an
          // ellipsis where it runs out (see ui/Modal), which is the right
          // treatment for a label and the wrong one for the single thing this
          // sheet is about: a place with a long name would be a preview of
          // "Trattoria del…". So the name goes at the head of the content, where
          // it can wrap, and the head of the sheet says the same word the tile
          // it was opened from says — the arrangement the remarks sheet already
          // uses for the same reason (see CommentsModal).
          title={t(`${kind}.title`)}
          onClose={() => setOpen(null)}
          closeOnOverlay
        >
          {chosen && (
            <div className={styles.preview}>
              <p className={styles.previewName}>{chosen.name}</p>
              {serves && <span className={styles.previewMeta}>{serves}</span>}
              <span className={styles.previewMeta}>{formatDistance(chosen.distance)}</span>
              {/* Held apart rather than spaced evenly, as on a mark's row and in
                  a bubble on the map: what leaves lo for Google Maps on the
                  left, what stays here out on the right, so a press meant for
                  the remarks is not a press made by accident on a tab that goes
                  somewhere else.
                  Words rather than icons, at the small print's own size, for the
                  reason spelled out in MarkItem: a glyph for "what is standing
                  there" is a guess, and the tooltip that settles it is not
                  something a phone has. */}
              <div className={styles.actions}>
                <span className={styles.group}>
                  {/* What is actually there, which a name and a cuisine do not
                      answer: the hours, the photographs, whether it is open now.
                      Google's place search, on the name — a mark is searched on
                      its coordinates instead, and the difference is where the
                      name came from (see placeSearchUrl in utils/maps.js). */}
                  <a
                    className={styles.action}
                    aria-label={`${t("map.search")} ${chosen.name}`}
                    {...placeSearchLink(chosen)}
                  >
                    {t("map.search")}
                  </a>
                  {/* The row's old job, now a word: turn-by-turn belongs to the
                      maps app on a handheld and the directions page on a
                      desktop, not to a tile on a dashboard. */}
                  <a
                    className={styles.action}
                    aria-label={`${t("map.nav")} ${chosen.name}`}
                    {...directionsLink(chosen, coords)}
                  >
                    {t("map.nav")}
                  </a>
                </span>
                {/* The word and the figure together, as in the bubble on the map:
                    the count is what says there is anything to open, and a nought
                    is worth printing here because it is the invitation to be the
                    first to say something. The kind goes with the place because
                    the sheet hands it back on the way out, and that is what says
                    which of the two lists to put the new figure in.
                    The preview goes as the remarks come up. Two sheets over one
                    another is a shape lo has (see ui/Modal), but not for these
                    two: this one is a preview of the thing now filling the
                    screen, and the pair of them would grey the dashboard twice
                    over for a box the reader would then have to put away twice. */}
                {onOpenComments && (
                  <button
                    type="button"
                    className={styles.action}
                    aria-label={`${t("comments.venueShort")} ${chosen.name}`}
                    onClick={() => {
                      setOpen(null);
                      onOpenComments({ ...chosen, kind });
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
