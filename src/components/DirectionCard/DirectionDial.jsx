import { useRef } from "react";
import styles from "./direction.module.css";

const TICKS = Array.from({ length: 72 }, (_, index) => {
  const major = index % 6 === 0;
  return (
    <i
      key={index}
      className={major ? styles.compassMajorTick : styles.compassTick}
      style={{ "--tick-angle": `${index * 5}deg` }}
    />
  );
});

const CARDINALS = [
  ["N", styles.cardinalNorth],
  ["E", styles.cardinalEast],
  ["S", styles.cardinalSouth],
  ["W", styles.cardinalWest],
].map(([point, position]) => (
  <span
    key={point}
    className={`${styles.cardinal} ${position} ${point === "N" ? styles.north : ""}`.trim()}
  >
    {point}
  </span>
));

// Keep the animated angle continuous at north. Without unwrapping, a reading
// moving from 359° to 0° makes a CSS transition take the long way around.
function useContinuousHeading(heading) {
  const angle = useRef(null);
  if (!Number.isFinite(heading)) {
    angle.current = null;
    return 0;
  }
  if (angle.current == null) {
    angle.current = heading;
  } else {
    const current = ((angle.current % 360) + 360) % 360;
    const shortestTurn = ((heading - current + 540) % 360) - 180;
    angle.current += shortestTurn;
  }
  return angle.current;
}

export default function DirectionDial({ heading, label }) {
  const live = Number.isFinite(heading);
  const angle = useContinuousHeading(heading);

  return (
    <div className={styles.compassBack}>
      <div className={styles.compassDial} role="img" aria-label={label}>
        <svg className={styles.compassFrame} viewBox="0 0 200 200" aria-hidden="true">
          <circle className={styles.compassRim} cx="100" cy="100" r="96" />
        </svg>
        <span className={styles.indexMark} aria-hidden="true" />
        <span className={styles.compassMarks} aria-hidden="true">
          {TICKS}
          {CARDINALS}
          <span
            className={`${styles.needle} ${live ? "" : styles.needleUnavailable}`.trim()}
            style={{ transform: `rotate(${angle}deg)` }}
          >
            <i className={styles.northNeedle} />
            <i className={styles.southNeedle} />
          </span>
          <i className={styles.compassPin} />
        </span>
      </div>
    </div>
  );
}
