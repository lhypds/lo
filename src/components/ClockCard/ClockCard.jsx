import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../../ui/index.js";
import { cardTurned, turnCard } from "../../utils/cards.js";
import { toggleHour12, useHour12 } from "../../utils/units.js";
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

// Sunrise and sunset said the way the hour above them is said: a tile reading
// 3:07 PM at the top and 18:40 along the bottom would be speaking two dialects
// of the same thing. The twenty-four hour reading is the slice as it stands; the
// twelve-hour one has to go through Intl for the word and for where the language
// puts it, and nothing here may hand it a real instant to do that with — so the
// minutes are dressed as a date in UTC and read back in UTC. The numbers go in
// and come out in the reader's own convention, having never been in a timezone.
function formatClockTime(value, locale, hour12) {
  if (!hour12) return localClockTime(value);
  const minutes = localMinutes(value);
  if (minutes === null) return "";
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));
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

// The face, in the two or three pieces it is set in. A 24-hour clock is a
// single figure; a 12-hour one is a figure and the half of the day it belongs
// to, and the half of the day is not part of the figure — it is a word, it does
// not change every minute, and set at the size of the hour it would be the
// loudest thing on the tile. So the two are taken apart here and put back
// together in the markup, with the seconds between them.
//
// Which side the word goes is the language's answer and not this card's: English
// puts it after the hour, Japanese and Chinese before it. formatToParts is asked
// rather than guessed at — the same call, read as pieces instead of as a line.
function readClock(date, zone, locale, hour12) {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    // Padded on the twenty-four hour reading and not on the twelve: 09:07 is how
    // a 24-hour clock is written and 9:07 is how a 12-hour one is, and the zero
    // that steadies the figure on the one is a thing nobody writes on the other.
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12,
  }).formatToParts(date);
  const period = parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  // Everything that is not the word, which leaves the hour, the separator, the
  // minute and whatever space the locale set between them and the word — the
  // space being the one piece that is not wanted once the two are set apart.
  const digits = parts
    .filter((part) => part.type !== "dayPeriod")
    .map((part) => part.value)
    .join("")
    .trim();
  return { digits, period, leading: parts[0]?.type === "dayPeriod" };
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
  const hour12 = useHour12();
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
  const { digits, period, leading } = readClock(now, zone, locale, hour12);
  const seconds = wall ? String(wall.second).padStart(2, "0") : "";
  // The face said as one line rather than as the pieces it is set in — for the
  // dial on the other side, which is a picture and has to be answered for in
  // words to anyone who cannot see it.
  const spoken = [leading ? period : "", digits, leading ? "" : period].filter(Boolean).join(" ");
  const turnScale = t(hour12 ? "clock.to24" : "clock.to12");
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
      back={wall && <ClockDial {...wall} label={spoken} />}
    >
      <div className={styles.inner}>
        <div className={styles.top}>
          {/* One press on the hour and it is read the other way round — see
              utils/units.js for why that answer is the reader's and why it is
              taken here rather than in a settings panel. A button and not a
              handler on a span, so it can be reached from the keyboard and is
              announced as something to press; the hint rides as a title, which
              leaves the time itself as the button's name. */}
          <button type="button" className={styles.face} onClick={toggleHour12} title={turnScale}>
            {leading && period && <span className={styles.period}>{period}</span>}
            <span className={styles.time}>{digits}</span>
            <span className={styles.seconds}>{seconds}</span>
            {!leading && period && <span className={styles.period}>{period}</span>}
          </button>
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
              <dd>
                {`${formatClockTime(today.sunrise, locale, hour12)} - ${formatClockTime(today.sunset, locale, hour12)}`}
              </dd>
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
