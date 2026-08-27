import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../../ui/index.js";
import { formatCoords } from "../../utils/format.js";
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

// Which way the thing in your hand is pointing, and where the hand is standing.
//
// One square, the size of the clock and the weather beside it and built in the
// same three parts: a figure on the top edge, a small drawing beside it, and the
// readings along the bottom. It does not resize, because a face is a face — there
// is nothing more of it to show a reader who gives it another tile, only the same
// dial drawn larger (see utils/cards.js).
//
// The tile is in two halves and the halves fail separately, which is the whole of
// its layout. Above the rule is the handset: the dial, or — where the instruments
// are off, refused, or simply not in the device — the button and the sentence
// that stand in its place. Below the rule is the fix, which wants none of the
// permission this card asks for and is drawn whether the instruments answered or
// not. A phone that will not give up its gyroscope still knows where it is, and a
// tile going blank over the half it lacks would be hiding the half it has.
//
// So of the four readings only the turn rate is an instrument's. The coordinates
// and the speed are the fix's, straight off the GPS. Altitude is the fix's too
// and is the odd one — the fix carries it where the device has a GPS good enough
// to claim it (see utils/location.js), and where it does not, the ground here is
// a number the weather already came back with. Both are metres above sea level
// and only one of them is about the phone, so the card says which it is showing.
export default function CompassCard() {
  const { t } = useTranslation();
  const { coords, weather } = useHere();
  const { status, heading, headingAccuracy, turnRate } = useSensors();
  const turn = useTurn(heading);
  const live = status === "on";

  // The device's own altitude first and the ground under it second: a GPS that
  // can answer this is answering about the phone, which is the question the rest
  // of the card is about. Open-Meteo's elevation is the terrain of a model cell
  // several kilometres wide — right about the valley, silent about the building.
  const altitude = Number.isFinite(coords?.altitude)
    ? { metres: coords.altitude, ground: false }
    : Number.isFinite(weather?.elevation)
      ? { metres: weather.elevation, ground: true }
      : null;

  // Over the ground, off the GPS, and never off the accelerometer: that
  // instrument measures force and steady movement has none, so a speed taken
  // from it reads about half the truth and nothing at all while coasting. See
  // utils/sensors.js, which is where the arithmetic for it used to be.
  const speed = Number.isFinite(coords?.speed) ? coords.speed : null;

  let handset;
  if (live) {
    handset = (
      <div className={styles.now}>
        <CompassRose className={styles.glyph} turn={turn} unknown={heading == null} />
        <span className={styles.figure}>{heading == null ? NONE : `${Math.round(heading)}°`}</span>
        {/* Beside the figure rather than under it, the way the clock keeps its
            seconds: one square has one line to spend on the answer, and the word
            is the smaller half of it. */}
        {heading != null && (
          <span className={styles.point}>{t(`compass.point.${pointKey(heading)}`)}</span>
        )}
      </div>
    );
  } else if (status === "listening") {
    // Attached and nothing has arrived. Two seconds of this and the store calls
    // it unsupported instead — a browser with no instruments behind these events
    // never refuses, it just never fires one.
    handset = <p className={styles.noticeText}>{t("common.loading")}</p>;
  } else {
    // Half a square has room for the sentence or for the button, not both, and a
    // button that says what it does is the sentence. Where there is nothing to
    // press — refused, or nothing there to turn on — the words stand alone.
    handset =
      status === "idle" || status === "asking" ? (
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
      );
  }

  // How sure the compass is of itself, which is the one thing about the heading
  // the dial cannot draw. Only iOS gives a figure for it; where none comes, the
  // heading is the whole answer and the heading is on the tile.
  const meta =
    live && Number.isFinite(headingAccuracy)
      ? t("compass.accuracy", { degrees: Math.round(headingAccuracy) })
      : null;

  return (
    <Card title={t("compass.title")} meta={meta} square>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.handset}>{handset}</div>
          {/* The fix itself, on the line where the tile stops being about the
              phone and starts being about the place. Small and quiet: it is the
              address of everything above it rather than a reading of its own. */}
          <p className={styles.fix}>{coords ? formatCoords(coords.latitude, coords.longitude) : NONE}</p>
        </div>
        <dl className={styles.rows}>
          <div>
            <dt>{altitude?.ground ? t("compass.ground") : t("compass.altitude")}</dt>
            <dd>{altitude ? `${Math.round(altitude.metres)} m` : NONE}</dd>
          </div>
          {/* Off the GPS and so on the tile whatever the handset's own
              instruments are doing — a phone that will not give up its gyroscope
              still knows how fast it is going over the ground. Null more often
              than not, mind: only a device actually tracking on GPS answers this
              at all, and one placing itself off wifi never does. */}
          <div>
            <dt>{t("compass.speed")}</dt>
            <dd>
              {speed == null ? NONE : speed.toFixed(1)}
              {speed != null && <span className={styles.unit}>m/s</span>}
            </dd>
          </div>
          {/* The one row that is an instrument's, and the one that goes when the
              instruments are off: a tile with its sensors refused has a button to
              draw instead, and this row's worth of dashes is the space it needs. */}
          {live && (
            <div>
              <dt>{t("compass.gyroscope")}</dt>
              <dd>
                {turnRate == null ? NONE : Math.round(turnRate)}
                {turnRate != null && <span className={styles.unit}>°/s</span>}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </Card>
  );
}
