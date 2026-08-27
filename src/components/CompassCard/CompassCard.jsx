import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, Skeleton } from "../../ui/index.js";
import { startSensors, useSensors } from "../../utils/sensors.js";
import { useHere } from "../LocationProvider/index.js";
import CompassRose from "./CompassRose.jsx";
import styles from "./compass.module.css";

// What stands where an instrument has not answered: a dash, rather than a zero
// that would read as a reading.
const NONE = "—";

// Eight points is as fine as a name is worth: a phone in a hand wanders further
// than sixteen of them are apart.
const POINTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

function pointKey(heading) {
  return POINTS[Math.round(heading / 45) % 8];
}

// The three axes as one figure: how hard the thing is being pushed, and how fast
// it is being turned, whichever way either is happening. Three numbers each would
// be six numbers on a tile this size, all of them moving ten times a second — the
// axes are what an instrument measures and this is what it is measuring.
//
// Gravity is in the first of them, so a phone lying still on a table reads 9.8
// rather than nothing. That is the reading being right, not the phone falling.
function magnitude(reading) {
  if (!reading) return null;
  const axes = ["x", "y", "z"].map((axis) => (Number.isFinite(reading[axis]) ? reading[axis] : 0));
  return Math.hypot(...axes);
}

// The dial turns the short way round. Handed 359° and then 1°, a transform would
// draw two degrees of movement as a 358° spin backwards, so the angle is carried
// forward instead of reset — the same reading, counted on from wherever the dial
// already stands.
function useTurn(heading) {
  const turn = useRef(0);
  if (heading != null) {
    turn.current += ((heading - (turn.current % 360) + 540) % 360) - 180;
  }
  return turn.current;
}

// What the handset knows about itself. Every other card on the dashboard is a
// reading of where you are; this one is a reading of the thing in your hand —
// which way it is pointing, how it is being pushed about, how fast it is being
// turned, and how high up it is standing. Four instruments and one card, because
// they are four answers to a single question: not where am I but how am I held.
//
// One square, the size of the clock and the weather beside it and built in the
// same three parts: a figure on the top edge, a small drawing beside it, and the
// readings along the bottom. It does not resize, because a face is a face — there
// is nothing more of it to show a reader who gives it another tile, only the same
// dial drawn larger (see utils/cards.js).
//
// Altitude is the odd one of the four. It is not an instrument of its own — the
// fix carries it where the device has a GPS good enough to claim it (see
// utils/location.js), and where it does not, the ground here is a number the
// weather already came back with. Both are metres above sea level and only one of
// them is about the phone, so the card says which it is showing.
export default function CompassCard() {
  const { t } = useTranslation();
  const { coords, weather } = useHere();
  const { status, heading, headingAccuracy, acceleration, rotation } = useSensors();
  const turn = useTurn(heading);

  // The device's own altitude first and the ground under it second: a GPS that
  // can answer this is answering about the phone, which is the question the rest
  // of the card is about. Open-Meteo's elevation is the terrain of a model cell
  // several kilometres wide — right about the valley, silent about the building.
  const altitude = Number.isFinite(coords?.altitude)
    ? { metres: coords.altitude, ground: false }
    : Number.isFinite(weather?.elevation)
      ? { metres: weather.elevation, ground: true }
      : null;

  const push = magnitude(acceleration);
  const turnRate = magnitude(rotation);

  let body;
  if (status === "on") {
    body = (
      <div className={styles.inner}>
        <div className={styles.now}>
          <CompassRose className={styles.glyph} turn={turn} unknown={heading == null} />
          <span className={styles.figure}>{heading == null ? NONE : `${Math.round(heading)}°`}</span>
          {/* Beside the figure rather than under it, the way the clock keeps its
              seconds: one square has one line to spend on the answer, and the
              word is the smaller half of it. */}
          {heading != null && (
            <span className={styles.point}>{t(`compass.point.${pointKey(heading)}`)}</span>
          )}
        </div>
        <dl className={styles.rows}>
          <div>
            <dt>{altitude?.ground ? t("compass.ground") : t("compass.altitude")}</dt>
            <dd>{altitude ? `${Math.round(altitude.metres)} m` : NONE}</dd>
          </div>
          <div>
            <dt>{t("compass.accelerometer")}</dt>
            <dd>
              {push == null ? NONE : push.toFixed(1)}
              {push != null && <span className={styles.unit}>m/s²</span>}
            </dd>
          </div>
          <div>
            <dt>{t("compass.gyroscope")}</dt>
            <dd>
              {turnRate == null ? NONE : Math.round(turnRate)}
              {turnRate != null && <span className={styles.unit}>°/s</span>}
            </dd>
          </div>
        </dl>
      </div>
    );
  } else if (status === "listening") {
    // Attached and nothing has arrived. Two seconds of this and the store calls
    // it unsupported instead — a browser with no instruments behind these events
    // never refuses, it just never fires one.
    body = <Skeleton fill label={t("common.loading")} />;
  } else {
    // A square has room for the sentence or for the button, not both, and a
    // button that says what it does is the sentence. Where there is nothing to
    // press — refused, or nothing there to turn on — the words stand alone.
    body = (
      <div className={styles.notice}>
        {status === "idle" || status === "asking" ? (
          <button
            type="button"
            className={styles.enable}
            onClick={startSensors}
            disabled={status === "asking"}
          >
            {status === "asking" ? t("compass.asking") : t("compass.enable")}
          </button>
        ) : (
          <p className={styles.noticeText}>
            {status === "denied" ? t("compass.denied") : t("compass.unsupported")}
          </p>
        )}
      </div>
    );
  }

  // How sure the compass is of itself, which is the one thing about the heading
  // the dial cannot draw. Only iOS gives a figure for it; where none comes, the
  // heading is the whole answer and the heading is on the tile.
  const meta =
    status === "on" && Number.isFinite(headingAccuracy)
      ? t("compass.accuracy", { degrees: Math.round(headingAccuracy) })
      : null;

  return (
    <Card title={t("compass.title")} meta={meta} square>
      {body}
    </Card>
  );
}
