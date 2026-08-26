import styles from "./card.module.css";

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
  wide = false,
  flush = false,
  className,
  children,
}) {
  const classes = [
    styles.card,
    square ? styles.square : "",
    half ? styles.half : "",
    wide ? styles.wide : "",
    className,
  ];
  return (
    <section className={classes.filter(Boolean).join(" ")}>
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
