import styles from "./compass.module.css";

// The dial, at the size of an icon. This tile is one square and the reading is
// the figure beside it, which leaves the drawing the one thing a number cannot
// say: that north is over there. So it is a ring, eight ticks and a filled pip at
// north — the letters and the figure it carried when it was a panel four squares
// big were mush at a third of that.
//
// A compass card in the sense the instrument means it: the dial is the part that
// turns and the mark at the top is the part that stays. The mark is where the
// phone is pointing — it cannot move, since it is the phone — and north goes
// wherever north is.
//
// Drawn on the same 24-unit square as the weather glyphs, in the same stroke
// language, so the one thing sized in the stylesheet is the tile it sits on.
const TICKS = [45, 90, 135, 180, 225, 270, 315];

export default function CompassRose({ turn, unknown, className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path className={styles.index} d="M10.4 1.2 12 3.4 13.6 1.2" />
      {/* The one thing that moves. Dimmed rather than hidden where the device has
          no compass in it: a dial standing still is still saying north is up, and
          that is a claim this card would have nothing behind. */}
      <g
        className={[styles.dial, unknown ? styles.unknown : ""].filter(Boolean).join(" ")}
        transform={`rotate(${-turn} 12 12)`}
      >
        <circle className={styles.ring} cx="12" cy="12" r="8.4" />
        {TICKS.map((angle) => (
          <line
            key={angle}
            className={styles.tick}
            x1="12"
            y1="4.4"
            x2="12"
            y2={angle % 90 === 0 ? 6.6 : 5.8}
            transform={`rotate(${angle} 12 12)`}
          />
        ))}
        {/* North filled, and the only filled thing on the dial: whichever way the
            card is lying, this is the end that means something. It stands where
            the tick at north would have — the pip is that tick, said louder. */}
        <path className={styles.north} d="M12 3.6 10.4 7 13.6 7Z" />
      </g>
    </svg>
  );
}
