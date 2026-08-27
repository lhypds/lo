import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, Skeleton } from "../../ui/index.js";
import { LARGE, SMALL, useCardSize } from "../../utils/cards.js";
import { startSensors, useSensors } from "../../utils/sensors.js";
import CardSize from "../CardSize/index.js";
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

// The three axes on one line, in the order the instruments file them. Rounded
// hard, because the figures are being read off a thing somebody is holding: an
// accelerometer's third decimal is a heartbeat.
function axes(reading, digits) {
  if (!reading) return null;
  return ["x", "y", "z"]
    .map((axis) => (Number.isFinite(reading[axis]) ? reading[axis].toFixed(digits) : NONE))
    .join(" / ");
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
// Altitude is the odd one of the four. It is not an instrument of its own — the
// fix carries it where the device has a GPS good enough to claim it (see
// utils/location.js), and where it does not, the ground here is a number the
// weather already came back with. Both are metres above sea level and only one
// of them is about the phone, so the card says which it is showing.
export default function CompassCard() {
  const { t } = useTranslation();
  const { coords, weather } = useHere();
  const size = useCardSize("compass");
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

  let body;
  if (status === "on") {
    body = (
      <div className={`${styles.inner} ${size === LARGE ? styles.stack : styles.flat}`}>
        <CompassRose
          className={styles.rose}
          turn={turn}
          unknown={heading == null}
          reading={heading == null ? NONE : `${Math.round(heading)}°`}
          point={heading == null ? "" : t(`compass.point.${pointKey(heading)}`)}
          marks={{
            n: t("compass.point.n"),
            e: t("compass.point.e"),
            s: t("compass.point.s"),
            w: t("compass.point.w"),
          }}
        />
        <dl className={styles.rows}>
          <div>
            <dt>{altitude?.ground ? t("compass.ground") : t("compass.altitude")}</dt>
            <dd>{altitude ? `${Math.round(altitude.metres)} m` : NONE}</dd>
          </div>
          <div>
            <dt>{t("compass.accelerometer")}</dt>
            <dd>
              {axes(acceleration, 1) ?? NONE}
              {acceleration && <span className={styles.unit}>m/s²</span>}
            </dd>
          </div>
          <div>
            <dt>{t("compass.gyroscope")}</dt>
            <dd>
              {axes(rotation, 1) ?? NONE}
              {rotation && <span className={styles.unit}>°/s</span>}
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
    const notice = {
      idle: { text: t("compass.body"), button: t("compass.enable") },
      asking: { text: t("compass.body"), button: t("compass.asking") },
      denied: { text: t("compass.denied"), hint: t("compass.deniedHint"), button: t("common.retry") },
      unsupported: { text: t("compass.unsupported") },
    }[status];

    body = (
      <div className={styles.notice}>
        <p className={styles.noticeText}>
          {notice.text}
          {notice.hint && <span className={styles.hint}>{notice.hint}</span>}
        </p>
        {notice.button && (
          <button
            type="button"
            className={styles.enable}
            onClick={startSensors}
            disabled={status === "asking"}
          >
            {notice.button}
          </button>
        )}
      </div>
    );
  }

  // How sure the compass is of itself, which is the one thing about the heading
  // the dial cannot draw. Only iOS gives a figure for it; where none comes, the
  // heading is the whole answer and the heading is on the dial.
  const meta =
    status === "on" && Number.isFinite(headingAccuracy)
      ? t("compass.accuracy", { degrees: Math.round(headingAccuracy) })
      : null;

  return (
    <Card
      title={t("compass.title")}
      meta={meta}
      action={<CardSize id="compass" />}
      wide
      half={size === SMALL}
      square={size === LARGE}
    >
      {body}
    </Card>
  );
}
