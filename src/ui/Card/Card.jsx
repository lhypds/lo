import { createContext, useContext, useState } from "react";
import styles from "./card.module.css";

// Which card of a set of tiles this one is, said by whatever laid them out rather
// than by each tile about itself — the dashboard grid is the only thing that deals
// in sets of them, and the ids are its own (see HomePage and utils/cards.js). What
// it is for is the drag: a heading held for half a second has to be answered for
// with the name of the card it belongs to, and the tile under the finger with the
// name of the one whose place it would take.
//
// Read here and by the mark button, which is a tile without being a card.
// Anywhere else it is null and the tile says nothing: a card standing on a page
// rather than in a set is not one of anything to be ordered.
export const TileId = createContext(null);

// The one box every dashboard component sits in: a title on the left, whatever
// the card wants to say about itself on the right, a line under both, and the
// content below. `square` is what makes the dashboard a grid of equal tiles; the
// card is also a container, so the content inside can size itself to the tile it
// landed in rather than to the window.
//
// The line under the title is not optional. Two cards used to be able to soften
// it or leave it out — the clock and the weather, whose contents read as one
// column under the heading anyway, and the map, where full ink looked like a
// second frame drawn inside the card's own. Each was right about its own tile
// and wrong about the page: read down a grid of them, the cards without the line
// were the ones that looked unfinished.
//
// `back` is the other thing that can be written on a card: give it one and the
// card has two sides, turned over by a double-click on the heading. The heading
// itself goes round with it — a card seen from behind is still the same card, and
// the way back is the same two presses that got you here.
//
// Which side it is dealt showing is `defaultFlipped`, and `onFlip` is how the
// card says it has been turned. Default rather than controlled, in the sense
// React gives a field's defaultValue: the turning belongs to this box, because a
// turn is an animation and an animation has a direction, and a side handed in
// from outside would be a card arriving already turned with no way round. So the
// caller says where it starts and is told where it got to; what it does with that
// — remembering it past the life of the tile, or nothing at all — is its own.
export default function Card({
  title,
  meta,
  action,
  back,
  flipHint,
  defaultFlipped = false,
  onFlip,
  square = false,
  half = false,
  tall = false,
  wide = false,
  flush = false,
  className,
  children,
}) {
  // The side the card was dealt, taken once and not read again: after this the
  // turning is the card's own, and the same answer coming back through the prop —
  // the caller having written down what onFlip just told it — must not be read as
  // the card being turned a second time.
  const [dealt] = useState(defaultFlipped);
  // How many times it has been turned over since. Counted rather than held as a
  // yes or no because the turn is an animation and an animation has a direction: a
  // card standing as it was dealt is resting rather than mid-way through coming
  // back, and it must not play a turn the moment it mounts.
  const [turns, setTurns] = useState(0);
  const flipped = (turns + (dealt ? 1 : 0)) % 2 === 1;
  const classes = [
    styles.card,
    square ? styles.square : "",
    half ? styles.half : "",
    tall ? styles.tall : "",
    wide ? styles.wide : "",
    back ? styles.flip : "",
    back && flipped ? styles.flipped : "",
    className,
  ];
  const tile = useContext(TileId);

  // Written once and placed on both faces — a React element is a description of a
  // heading, and the same description can stand in two places.
  const head = (
    <header
      className={styles.head}
      title={back ? flipHint : undefined}
      // The heading is already the card's handle: held for half a second it picks
      // the card up, and dragged it turns the page (see HomePage). Two quick
      // presses are neither — the second is well inside the half-second the hold
      // wants, and neither of them travels — so the one strip carries all three.
      // The buttons standing in it keep their own presses.
      onDoubleClick={
        back
          ? (event) => {
              if (event.target.closest("button")) return;
              setTurns((count) => count + 1);
              onFlip?.(!flipped);
            }
          : undefined
      }
    >
      <h2 className={styles.title}>{title}</h2>
      {/* What the card says about itself and whatever it gives the reader to
          press are one group at the right end, rather than two things each
          asked to find their own way there: sent right on their own they split
          the free space between them and the meta line ends up stranded in the
          middle of the heading. */}
      {(meta != null || action) && (
        <span className={styles.tail}>
          {meta != null && <span className={styles.meta}>{meta}</span>}
          {action}
        </span>
      )}
    </header>
  );

  return (
    <section className={classes.filter(Boolean).join(" ")} data-card={tile ?? undefined}>
      {back ? (
        // Nothing to play on the first render — the card is standing as it was
        // dealt, not arriving from the other side. After that each turn is the one
        // set of frames, run forwards or in reverse (see card.module.css), and the
        // two names alternate, which is what makes a turn taken mid-turn start again.
        <div
          className={`${styles.pane} ${turns === 0 ? "" : flipped ? styles.toBack : styles.toFront}`.trim()}
        >
          {/* The face turned away is taken off the page as well as out of the
              picture: inert is what keeps the heading behind the card from being
              a second handle under the finger, and its contents from being read
              out a second time to anyone listening rather than looking. */}
          <div className={styles.face} inert={flipped}>
            {head}
            <div className={flush ? styles.flush : styles.body}>{children}</div>
          </div>
          <div className={`${styles.face} ${styles.rear}`} inert={!flipped}>
            {head}
            <div className={styles.body}>{back}</div>
          </div>
        </div>
      ) : (
        <>
          {head}
          <div className={flush ? styles.flush : styles.body}>{children}</div>
        </>
      )}
    </section>
  );
}
