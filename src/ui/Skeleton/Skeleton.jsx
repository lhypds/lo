import styles from "./skeleton.module.css";

// How wide the first bar of each row is. Varied down the list because a column
// of identical bars reads as a chart; type does not line up on the right.
const WIDTHS = [92, 74, 86, 66, 80, 70];

// What a card holds between being drawn and being answered. Every tile on the
// dashboard puts its frame up on the first paint and fills in afterwards, so
// the grid is the grid from the start and nothing under it jumps as the
// answers land one by one.
//
// Bars rather than the word "loading": the tile keeps the shape it is about to
// have, which is more of an answer than a sentence in the middle of an empty
// box — and it says it in every language without being translated. The word is
// still there for a screen reader, which has no shape to read.
//
// `lines` is how many a row of the real list has: two for the panels that put a
// title over a line of meta, one for the lists that are a name and a number.
// `fill` is the same idea for a tile whose content is not a list at all: one
// block the size of what is coming — the map's canvas, the weather's face.
export default function Skeleton({ rows = 3, lines = 2, fill = false, label, className }) {
  const classes = [fill ? styles.fill : styles.rows, className].filter(Boolean).join(" ");
  return (
    <div className={classes} aria-busy="true">
      {label && <span className="sr-only">{label}</span>}
      {fill ? (
        <span className={styles.block} aria-hidden="true" />
      ) : (
        Array.from({ length: rows }, (_, index) => (
          <span
            key={index}
            className={lines > 1 ? styles.row : `${styles.row} ${styles.tight}`}
            aria-hidden="true"
          >
            <span className={styles.bar} style={{ width: `${WIDTHS[index % WIDTHS.length]}%` }} />
            {lines > 1 && <span className={`${styles.bar} ${styles.under}`} />}
          </span>
        ))
      )}
    </div>
  );
}
