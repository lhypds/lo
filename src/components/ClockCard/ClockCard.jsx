import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../../ui/index.js";
import { cardTurned, turnCard } from "../../utils/cards.js";
import { useHere } from "../LocationProvider/index.js";
import ClockDial from "./ClockDial.jsx";
import styles from "./clock.module.css";

// Open-Meteo hands back sunrise/sunset already in the location's own local time
// ("2026-08-25T05:12"), so the clock face is a slice, not a parse — running it
// through Date would silently re-read it as the visitor's timezone.
function localClockTime(value) {
  return typeof value === "string" && value.includes("T") ? value.slice(11, 16) : "";
}

// Same slice, read as minutes past the location's own midnight — the unit both
// the day's length and the wait for the next sunrise are measured in.
function localMinutes(value) {
  const clock = localClockTime(value);
  if (!clock) return null;
  const hours = Number(clock.slice(0, 2));
  const minutes = Number(clock.slice(3, 5));
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

// The wall clock at the coordinates, not in the browser — h23 rather than
// hour12:false because some locales still render midnight as 24:00. Read as
// numbers rather than as a line of type because three things want it that way:
// the sun rows below compare it against dawn and dusk, the seconds on the front
// are set apart from the hour and minute, and the dial on the back is three
// angles (see ClockDial).
function zonedParts(date, zone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type) => Number(parts.find((part) => part.type === type)?.value);
  const hour = read("hour");
  const minute = read("minute");
  const second = read("second");
  return Number.isFinite(hour) && Number.isFinite(minute) && Number.isFinite(second)
    ? { hour: hour % 24, minute, second }
    : null;
}

function formatDuration(minutes, t) {
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? t("clock.duration", { hours, minutes: rest }) : t("clock.durationMinutes", { minutes: rest });
}

function formatOffset(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const sign = seconds < 0 ? "-" : "+";
  const total = Math.abs(seconds);
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

export default function ClockCard() {
  const { t, i18n } = useTranslation();
  const { weather } = useHere();
  const [now, setNow] = useState(() => new Date());

  // Aligned to the wall clock rather than to mount: a card that appears at
  // :30.7 still flips its seconds when the second actually turns over.
  useEffect(() => {
    let timer;
    function tick() {
      setNow(new Date());
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    }
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => window.clearTimeout(timer);
  }, []);

  // Until the server answers, the browser's own zone stands in — the numbers are
  // right for the reader even before they are right for the coordinates.
  const zone = weather?.timezone?.id || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = i18n.language;

  const wall = zonedParts(now, zone);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const seconds = wall ? String(wall.second).padStart(2, "0") : "";
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(now);

  const today = weather?.today;
  const offset = weather?.timezone ? t("clock.offset", { offset: formatOffset(weather.timezone.offsetSeconds) }) : "";

  // Sun rows only where the sun actually rises and sets: inside the polar
  // circles Open-Meteo answers with null for half the year, and a day with no
  // dawn has no daylight length and no next sunrise to count down to either.
  const sunrise = localMinutes(today?.sunrise);
  const sunset = localMinutes(today?.sunset);
  const hasSun = sunrise !== null && sunset !== null;
  const clockNow = wall ? wall.hour * 60 + wall.minute : null;
  const night = hasSun && clockNow !== null && (clockNow < sunrise || clockNow >= sunset);
  // Before dawn the wait is today's sunrise; after dusk it is tomorrow's, which
  // the three-day forecast already carries — barring that, today's stands in.
  const nextSunrise = localMinutes(weather?.upcoming?.[0]?.sunrise) ?? sunrise;
  const wait = night ? (clockNow < sunrise ? sunrise - clockNow : 1440 - clockNow + nextSunrise) : null;
  const light = hasSun && !night ? sunset - sunrise : null;

  return (
    // The other side of this card is the same hour with hands on it, a
    // double-click on the heading away (see ui/Card). Two readings of one thing
    // rather than two things: the front is the tile you glance at, the back is
    // the one you look at.
    //
    // Which of them is up is kept with the rest of what the reader has settled
    // about this tile (see utils/cards.js), for the reason its size is: the
    // dashboard is unmounted whenever they go anywhere else in the app, and a
    // reader who left a clock with hands on it should not come back to a row of
    // digits.
    <Card
      title={t("clock.title")}
      meta={offset}
      square
      flipHint={t("clock.turn")}
      defaultFlipped={cardTurned("clock")}
      onFlip={(turned) => turnCard("clock", turned)}
      back={wall && <ClockDial {...wall} label={time} />}
    >
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.face}>
            <span className={styles.time}>{time}</span>
            <span className={styles.seconds}>{seconds}</span>
          </div>
          <p className={styles.date}>{date}</p>
        </div>
        <dl className={styles.rows}>
          <div>
            <dt>{t("clock.timezone")}</dt>
            <dd>{zone}</dd>
          </div>
          {hasSun && (
            <div>
              <dt>{`${t("clock.rise")} - ${t("clock.set")}`}</dt>
              <dd>{`${localClockTime(today.sunrise)} - ${localClockTime(today.sunset)}`}</dd>
            </div>
          )}
          {hasSun && (
            <div>
              <dt>{night ? t("clock.untilRise") : t("clock.light")}</dt>
              <dd>{formatDuration(night ? wait : light, t)}</dd>
            </div>
          )}
        </dl>
      </div>
    </Card>
  );
}
