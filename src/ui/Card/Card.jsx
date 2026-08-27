import { createContext, useContext } from "react";
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
export default function Card({
  title,
  meta,
  action,
  square = false,
  half = false,
  tall = false,
  wide = false,
  flush = false,
  className,
  children,
}) {
  const classes = [
    styles.card,
    square ? styles.square : "",
    half ? styles.half : "",
    tall ? styles.tall : "",
    wide ? styles.wide : "",
    className,
  ];
  const tile = useContext(TileId);
  return (
    <section className={classes.filter(Boolean).join(" ")} data-card={tile ?? undefined}>
      <header className={styles.head}>
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
      <div className={flush ? styles.flush : styles.body}>{children}</div>
    </section>
  );
}
