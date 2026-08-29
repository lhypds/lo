import { useRef } from "react";
import styles from "./direction.module.css";

const TICKS = Array.from({ length: 72 }, (_, index) => {
  const angle = (index * Math.PI) / 36;
  const major = index % 6 === 0;
  const inner = major ? 82 : index % 2 === 0 ? 86 : 89;
  return (
    <line
      key={index}
      className={major ? styles.compassMajorTick : styles.compassTick}
      x1={100 + Math.sin(angle) * inner}
      y1={100 - Math.cos(angle) * inner}
      x2={100 + Math.sin(angle) * 91}
      y2={100 - Math.cos(angle) * 91}
    />
  );
});

const CARDINALS = [
  ["N", 0],
  ["E", 90],
  ["S", 180],
  ["W", 270],
].map(([point, degrees]) => {
  const angle = (degrees * Math.PI) / 180;
  return (
    <text
      key={point}
      className={`${styles.cardinal} ${point === "N" ? styles.north : ""}`.trim()}
      x={100 + Math.sin(angle) * 68}
      y={100 - Math.cos(angle) * 68 + 4}
      textAnchor="middle"
    >
      {point}
    </text>
  );
});

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
      <svg className={styles.compassDial} viewBox="0 0 200 200" role="img" aria-label={label}>
        <circle className={styles.compassRim} cx="100" cy="100" r="96" />
        {TICKS}
        {CARDINALS}
        <path className={styles.indexMark} d="M100 5 L94 15 H106 Z" />
        <g
          className={`${styles.needle} ${live ? "" : styles.needleUnavailable}`.trim()}
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <path className={styles.northNeedle} d="M100 35 L108 100 L100 94 L92 100 Z" />
          <path className={styles.southNeedle} d="M100 165 L92 100 L100 106 L108 100 Z" />
        </g>
        <circle className={styles.compassPin} cx="100" cy="100" r="4" />
      </svg>
    </div>
  );
}
