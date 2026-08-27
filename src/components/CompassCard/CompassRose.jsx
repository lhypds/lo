import styles from "./compass.module.css";

// A compass card in the sense the instrument means it: the dial is the part that
// turns and the mark at the top is the part that stays. The mark is where the
// phone is pointing — it cannot move, since it is the phone — and north goes
// wherever north is, which is the whole of what the reading says.
//
// Drawn on a hundred-unit square in the same stroke language as the weather
// glyphs, so the one thing sized in the stylesheet is the tile it sits on.

// Every fifteen degrees, and four times longer where the dial is named.
const TICKS = Array.from({ length: 24 }, (_, index) => index * 15);

// Upright on the card rather than turned to face out, so the four of them read
// as one printed face that happens to be lying at an angle.
const MARKS = [
  { key: "n", x: 50, y: 26 },
  { key: "e", x: 74, y: 50 },
  { key: "s", x: 50, y: 74 },
  { key: "w", x: 26, y: 50 },
];

export default function CompassRose({ turn, reading, point, marks, unknown, className }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path className={styles.index} d="M45 3 50 11 55 3" />
      {/* The one thing that moves. Dimmed rather than hidden where the device has
          no compass in it: a dial standing still is still saying north is up,
          and that is a claim this card would have nothing behind. */}
      <g
        className={[styles.dial, unknown ? styles.unknown : ""].filter(Boolean).join(" ")}
        transform={`rotate(${-turn} 50 50)`}
      >
        <circle className={styles.ring} cx="50" cy="50" r="42" />
        {TICKS.map((angle) => (
          <line
            key={angle}
            className={styles.tick}
            x1="50"
            y1="8"
            x2="50"
            y2={angle % 90 === 0 ? 17 : 12}
            transform={`rotate(${angle} 50 50)`}
          />
        ))}
        {/* North filled, and the only filled thing on the dial: whichever way the
            card is lying, this is the end that means something. Out among the
            ticks rather than in beside the letters, so that the middle of the
            dial is left to the figure being read off it. */}
        <path className={styles.north} d="M50 9 47 17 53 17Z" />
        {MARKS.map(({ key, x, y }) => (
          <text key={key} className={styles.mark} x={x} y={y} textAnchor="middle" dominantBaseline="central">
            {marks[key]}
          </text>
        ))}
      </g>
      {/* Read off the dial rather than drawn on it, so the figure stays upright
          and stays put — the two numbers a reader takes from a compass are which
          way and how sure, and neither is worth chasing round a circle. */}
      <text className={styles.figure} x="50" y="48" textAnchor="middle" dominantBaseline="central">
        {reading}
      </text>
      {point && (
        <text className={styles.point} x="50" y="61" textAnchor="middle" dominantBaseline="central">
          {point}
        </text>
      )}
    </svg>
  );
}
