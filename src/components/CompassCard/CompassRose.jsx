import styles from "./compass.module.css";

// The dial, and on this tile it is the reading rather than an icon beside one:
// it takes the middle of the card's top half at whatever diameter the half can
// give it — a little under fifty pixels on the smallest square the grid draws,
// eighty on the largest — and the degrees are set small alongside as its caption
// (see compass.module.css). What it is for is the one thing the number cannot
// say: that north is over there.
//
// Still a ring, three ticks and a filled pip, which is what it wore when it was
// half this size. The letters and the inner figure it carried as a four-square
// panel are not back; there is room for them again at eighty pixels and none at
// all at thirty-two, and a dial that gains marks as the tile grows is two
// drawings rather than one.
//
// A compass card in the sense the instrument means it: the dial is the part that
// turns and the mark at the top is the part that stays. The mark is where the
// phone is pointing — it cannot move, since it is the phone — and north goes
// wherever north is.
//
// Drawn on the same 24-unit square as the weather glyphs, in the same stroke
// language, so the one thing sized in the stylesheet is the tile it sits on.
//
// Three ticks and the pip, rather than the eight or the twenty-four a dial is
// really marked with: at the floor of that range the marks between the quarters
// are a grey smudge round the rim, and the four that mean something are lost in
// it. The quarters carry the reading; the rest were only ever texture.
const TICKS = [90, 180, 270];

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
            y1="4.2"
            x2="12"
            y2="6.6"
            transform={`rotate(${angle} 12 12)`}
          />
        ))}
        {/* North filled, and the only filled thing on the dial: whichever way the
            card is lying, this is the end that means something. It stands where
            the tick at north would have — the pip is that tick, said louder. */}
        <path className={styles.north} d="M12 3.2 10.1 7.6 13.9 7.6Z" />
      </g>
    </svg>
  );
}
