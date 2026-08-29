import { useTranslation } from "react-i18next";
import { Card } from "../../ui/index.js";
import { cardTurned, turnCard } from "../../utils/cards.js";
import { startSensors, useSensors } from "../../utils/sensors.js";
import { useHere } from "../LocationProvider/index.js";
import DirectionDial from "./DirectionDial.jsx";
import styles from "./direction.module.css";

// What stands where an instrument has not answered: a dash, rather than a zero
// that would read as a reading.
const NONE = "—";

// Eight points is as fine as a name is worth: a phone in a hand wanders further
// than sixteen of them are apart.
const POINTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

function pointKey(heading) {
  return POINTS[Math.round(heading / 45) % 8];
}

// Which way the thing in your hand is pointing, and where the hand is standing.
//
// One square, built exactly as the clock and the weather beside it are built: the
// figure on the top edge, the readings pinned to the bottom, and the slack between
// them. Read across, the three tiles are one line of figures — which is why the
// degrees are set in --figure rather than in a size of this tile's own, and why
// they sit at the top rather than in the middle where they would land wherever
// this tile's own rows happened to end. It does not resize, because a face is a
// face (see utils/cards.js).
//
// There was a dial here and there is not now. A drawn compass rose has to be
// small enough to leave the readings their room and big enough to read as a
// drawing, and on one square it cannot be both.
//
// The tile is in two halves and the halves fail separately, which is the rest of
// its layout. Above the rule is the handset: the bearing, or - where the
// instruments are off, refused, or simply not in the device - the button and the
// sentence that stand in its place, centred in the same space. Below the rule are
// the readings, and they want none of the permission this card asks for: two of
// the three come off the fix and are drawn whether the instruments answered or
// not. A phone that will not give up its gyroscope still knows where it is, and a
// tile going blank over the half it lacks would be hiding the half it has.
//
// So of the three readings only the turn rate is an instrument's. Speed is the
// fix's, straight off the GPS. Altitude is the fix's too and is the odd one - the
// fix carries it where the device has a GPS good enough to claim it (see
// utils/location.js), and where it does not, the ground here is a number the
// weather already came back with. Both are metres above sea level and only one of
// them is about the phone, so the card says which it is showing.
export default function DirectionCard() {
  const { t } = useTranslation();
  const { coords, weather } = useHere();
  const { status, heading, headingAccuracy, turnRate } = useSensors();
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
    // The degrees and the word for them, on one line: the clock's arrangement of
    // its time and its seconds, at the clock's two sizes, because across the three
    // squares this is the same reading in the same place. The word is the smaller
    // half — the figure beside it has already said which way — and grey, so that
    // what the eye lands on first is the number.
    handset = (
      <div className={styles.now}>
        <span className={styles.figure}>{heading == null ? NONE : `${Math.round(heading)}°`}</span>
        {heading != null && (
          <span className={styles.point}>{t(`direction.point.${pointKey(heading)}`)}</span>
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
    // button that says what it does is the sentence. A refusal leaves the same
    // button in place: permission can be changed outside the page, and the page
    // must leave a way to ask the device again. Only a device with no sensor at
    // all has nothing useful to press.
    handset =
      status === "idle" || status === "asking" || status === "denied" ? (
        <button
          type="button"
          className={styles.enable}
          onClick={startSensors}
          disabled={status === "asking"}
        >
          {status === "asking" ? t("direction.asking") : t("direction.enable")}
        </button>
      ) : (
        <p className={styles.noticeText}>
          {status === "denied" ? t("direction.denied") : t("direction.unsupported")}
        </p>
      );
  }

  // How sure the instrument is of itself, which is the one thing about a bearing
  // the bearing cannot say. Only iOS gives a figure for it; where none comes, the
  // heading is the whole answer and the heading is on the tile.
  const meta =
    live && Number.isFinite(headingAccuracy)
      ? t("direction.accuracy", { degrees: Math.round(headingAccuracy) })
      : null;

  const compassLabel = Number.isFinite(heading)
    ? t("direction.compass", {
        degrees: Math.round(heading),
        point: t(`direction.point.${pointKey(heading)}`),
      })
    : t("direction.compassUnavailable");

  return (
    <Card
      title={t("direction.title")}
      meta={meta}
      square
      flipHint={t("direction.turn")}
      defaultFlipped={cardTurned("direction")}
      onFlip={(turned) => turnCard("direction", turned)}
      back={<DirectionDial heading={heading} label={compassLabel} />}
    >
      <div className={styles.inner}>
        <div className={styles.handset}>{handset}</div>
        <dl className={styles.rows}>
          <div>
            <dt>{altitude?.ground ? t("direction.ground") : t("direction.altitude")}</dt>
            <dd>{altitude ? `${Math.round(altitude.metres)} m` : NONE}</dd>
          </div>
          {/* Off the GPS and so on the tile whatever the handset's own
              instruments are doing — a phone that will not give up its gyroscope
              still knows how fast it is going over the ground. Null more often
              than not, mind: only a device actually tracking on GPS answers this
              at all, and one placing itself off wifi never does. */}
          <div>
            <dt>{t("direction.speed")}</dt>
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
              <dt>{t("direction.gyroscope")}</dt>
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
