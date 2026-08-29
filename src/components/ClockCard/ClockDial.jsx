import styles from "./clock.module.css";

// The back of the time card: the same reading as the digits on the front, drawn
// instead of written. This is liveboard's Clock face, brought across as it
// stands — the 200-unit square it is set out on, the radii the ticks run
// between, the lengths and weights of the three hands, and the four numerals.
// Nothing here is lo's own but the ink it is drawn in, and that only because
// #000 and lo's --ink are the same black to anyone looking at it. Liveboard's
// rim also casts a hard 2px shadow; lo's does not (see clock.module.css).
//
// Everything is in user units, so the whole drawing — strokes included — scales
// with the box it lands in. That is liveboard's behaviour and it is why the face
// holds together at the sizes a dashboard tile puts it at: nothing on it is
// fixed at a pixel length while everything around it grows.
const TICKS = Array.from({ length: 60 }, (_, index) => {
  const angle = (index * Math.PI) / 30;
  const major = index % 5 === 0;
  const inner = major ? 84 : 88;
  return (
    <line
      key={index}
      className={major ? styles.majorTick : styles.tick}
      x1={100 + Math.sin(angle) * inner}
      y1={100 - Math.cos(angle) * inner}
      x2={100 + Math.sin(angle) * 91}
      y2={100 - Math.cos(angle) * 91}
    />
  );
});

// The quarters, and only the quarters. Drawn once and kept, as the ticks are:
// the rim of a clock is the part of it that never moves, and this card renders
// again every second.
const NUMERALS = [12, 3, 6, 9].map((number) => {
  const angle = ((number % 12) * Math.PI) / 6;
  return (
    <text
      key={number}
      className={styles.numeral}
      x={100 + Math.sin(angle) * 68}
      y={100 - Math.cos(angle) * 68 + 4}
      textAnchor="middle"
    >
      {number}
    </text>
  );
});

export default function ClockDial({ hour, minute, second, label }) {
  // Each hand carries the one below it, which is the whole difference between a
  // clock and three separate dials: the hour hand is halfway to eleven by the
  // time the minute hand is at thirty.
  const hourAngle = (hour % 12) * 30 + minute * 0.5;
  const minuteAngle = minute * 6 + second * 0.1;
  const secondAngle = second * 6;
  return (
    // Not the whole of the box it is given: what the back of this card wants is
    // a clock on a wall with wall around it. How much wall is in clock.module.css
    // and is the one number here that is not liveboard's — a share of the tile
    // reads well on a desktop square and leaves a phone with a dial too small to
    // read, so the air gives way as the tile narrows.
    <div className={styles.back}>
      <svg className={styles.dial} viewBox="0 0 200 200" role="img" aria-label={label}>
        <circle className={styles.rim} cx="100" cy="100" r="96" />
        {TICKS}
        {NUMERALS}
        <line
          className={styles.hourHand}
          x1="100"
          y1="106"
          x2="100"
          y2="55"
          transform={`rotate(${hourAngle} 100 100)`}
        />
        <line
          className={styles.minuteHand}
          x1="100"
          y1="108"
          x2="100"
          y2="35"
          transform={`rotate(${minuteAngle} 100 100)`}
        />
        <line
          className={styles.secondHand}
          x1="100"
          y1="112"
          x2="100"
          y2="29"
          transform={`rotate(${secondAngle} 100 100)`}
        />
        <circle className={styles.pin} cx="100" cy="100" r="4" />
      </svg>
    </div>
  );
}
