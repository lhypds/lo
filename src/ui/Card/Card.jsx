import styles from "./card.module.css";

// The one box every dashboard component sits in: a title on the left, whatever
// the card wants to say about itself on the right, and the content below.
// `square` is what makes the dashboard a grid of equal tiles; the card is also
// a container, so the content inside can size itself to the tile it landed in
// rather than to the window.
export default function Card({
  title,
  meta,
  action,
  square = false,
  half = false,
  wide = false,
  flush = false,
  openHead = false,
  quietHead = false,
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
  const head = [styles.head, openHead ? styles.openHead : "", quietHead ? styles.quietHead : ""];
  return (
    <section className={classes.filter(Boolean).join(" ")}>
      <header className={head.filter(Boolean).join(" ")}>
        <h2 className={styles.title}>{title}</h2>
        {meta != null && <span className={styles.meta}>{meta}</span>}
        {action}
      </header>
      <div className={flush ? styles.flush : styles.body}>{children}</div>
    </section>
  );
}
