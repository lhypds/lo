import { useEffect, useRef, useState } from "react";
import { weatherIcon } from "../../utils/weather.js";
import WeatherGlyph from "./WeatherGlyph.jsx";
import styles from "./weather.module.css";

// The back of the weather card: the same sky read hour by hour instead of day by
// day. The front is the glance — what it is now, what today comes to, and the two
// days after it — and this is the look: when the rain arrives, when it cools off,
// when the afternoon is worth going out in. Two readings of one thing, which is
// what the clock's two faces are as well (see ClockCard).
//
// The rows are the front's own rows turned to a run of hours: what it is on the
// left, what it comes to on the right, and the space between them filled by the
// one thing a list of figures cannot say — the shape of the day, drawn as two
// lines an hour hung from the same left edge. The upper one is the warmth and
// the lower one the chance of rain, and read down the tile they are two curves
// over the same afternoon: where the pale line falls away and the black one
// climbs is the hour the weather turns.
//
// The whole day ahead is on the card and the tile is the window on it. What a
// square can hold at a readable height is six hours at the smallest and sixteen
// at the largest, and the rest are a scroll away — by the hour, because the rows
// are cut to a height that fits the opening a whole number of times and the
// scroll snaps to them. So the reader is never looking at half of one hour and
// half of another, and the run never ends mid-row against the card's edge.

// The shortest a row may be drawn and still be read: ten point type on one line,
// the hour's glyph beside it, and enough air between one row and the next that
// the run reads as a column rather than as a block. What it decides is how many
// rows a tile is cut into, and from that how tall each one is.
const ROW_MIN = 14;

// Below this the chance of rain is not worth reporting — the model says "5%" of
// a great many dry afternoons, and a figure and a line against every one of them
// is a day of noise for the few hours that matter. Under it the hour is
// left blank rather than drawn short: the two answers this card is asked are
// when it will rain and how warm it will be, and "hardly at all" is a no.
const RAIN_FLOOR = 10;

// How wide the warmth line is drawn for the coldest hour on show. A share of
// nought is an hour with nothing against its name, which reads as a reading that
// failed rather than as the low of the day. The rain line needs no such floor —
// nothing drawn there is the true answer, and it is what most hours give.
const BAR_FLOOR = 6;

// The hour it is where the forecast is for, written the way Open-Meteo writes
// its hours ("2026-08-30T14"). The run handed over starts at the hour of the
// reading, and a reading can be twenty minutes old by the time it is on screen —
// cached for ten at each end (see server/geo.js and LocationProvider) — so the
// hours already gone are dropped here, where the time is now, rather than there.
//
// en-CA for the date because it writes it the way the times themselves are
// written; h23 rather than hour12:false because some locales still say 24:00.
function hourNow(zone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}`;
}

export default function WeatherHours({ hours, zone, degrees }) {
  // Every hour is on the tile; how many of them are in the window at once is what
  // the tile decides. The list scrolls, and what the measurement below is for is
  // that it should scroll by whole hours: a row is drawn at exactly the height
  // that puts a whole number of them across the opening, so the run is never cut
  // through the middle of a row at the bottom edge, and every stop the scroll
  // snaps to is an hour rather than somewhere between two of them.
  //
  // The list is measured rather than the card, because the list is what the rows
  // have to fit in — the heading above it and the padding around it are already
  // taken off. Its own height is fixed at the body's (see .hours in
  // weather.module.css), so however tall the run inside it grows, what it is being
  // asked here does not change and the measurement cannot chase itself.
  const [rowHeight, setRowHeight] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.contentRect.height;
      // A tile that is not being drawn at all measures nought — expanding the map
      // takes every other card off the page with display:none (see .home-main-map
      // in styles.css) — and a card is not asked to redraw itself on its way out
      // of sight. What it was showing stands until it is on screen again.
      if (height > 0) setRowHeight(height / Math.max(1, Math.floor(height / ROW_MIN)));
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  // The hours still ahead. Strictly ahead: the hour in progress is what the front
  // of the card is already showing, and a row for it would be the same reading
  // twice with two different figures against it.
  //
  // A device whose own clock is wrong would drop the lot, so a window that comes
  // out empty falls back to the run as it was handed over: a forecast that starts
  // an hour ago is worth more than a blank card.
  const now = zone ? hourNow(zone) : "";
  const ahead = hours.filter((hour) => hour.time.slice(0, 13) > now);
  const shown = ahead.length > 0 ? ahead : hours;

  // The spread is that of the whole run and not of the hours in the window, so
  // that a line means the same thing wherever the reader has scrolled to: a scale
  // that were re-read at every stop would have the lines change length under a
  // gesture that is meant only to move along them.
  //
  // It is taken off the reading itself and not off the figure printed against it:
  // the figures are whole degrees, and a settled evening can round to the same
  // number a dozen times over and flatten a curve that is really there. Which
  // scale they are in makes no difference to a share of the spread, so the
  // conversion the rest of the tile goes through is not wanted here.
  const temperatures = shown.map((hour) => hour.temperature).filter((value) => Number.isFinite(value));
  const low = Math.min(...temperatures);
  const high = Math.max(...temperatures);
  // Where the hour stands in that spread, as a share of the row's width. Not a
  // quantity measured from nothing — a temperature has no nothing to measure from
  // — but a place between the coldest hour on the tile and the warmest, which is
  // what makes the column of them the shape of the day. A run with no spread at
  // all has nowhere to place anything, and every line is then drawn at the low.
  //
  // Which is the whole difference between the two lines, and why they are drawn
  // in two weights rather than two lengths of the same one: the chance of rain is
  // a share of a certainty and is measured from nothing, so it needs no scale
  // read off the other hours and a full row means what it says.
  const share = (value) =>
    !Number.isFinite(value) || high === low
      ? BAR_FLOOR
      : BAR_FLOOR + ((value - low) / (high - low)) * (100 - BAR_FLOOR);

  // A dry run of hours keeps neither the figure nor the second line: the room
  // they take is the room the day's shape is drawn in, and a card that never
  // draws the lower line is one where the upper one needs no telling apart. So
  // the pair arrive together or not at all — which is also what makes the figure
  // the lower line's label the first time anyone turns the card over.
  //
  // Asked of the whole run, like the spread above and for the same reason: a
  // column that came and went as the reader scrolled past the weather would move
  // every other column on the tile with it.
  const wet = shown.some((hour) => hour.rain >= RAIN_FLOOR);

  return (
    <ul
      ref={listRef}
      className={`${styles.hours} ${wet ? styles.hoursWet : ""}`.trim()}
      style={rowHeight ? { "--hour-row": `${rowHeight}px` } : undefined}
    >
      {shown.map((hour) => {
        const temperature = degrees(hour.temperature);
        const rain = hour.rain >= RAIN_FLOOR ? hour.rain : 0;
        return (
          <li key={hour.time}>
            {/* Always the twenty-four hour reading, as sunrise and sunset are on
                the clock card and for the same reason: this is a run of hours
                being read down rather than a time anyone is asked to read off a
                watch, and 14:00 under 13:00 is a column the eye can run down in a
                way that 2 PM under 1 PM is not. */}
            <span className={styles.hourTime}>{hour.time.slice(11, 16)}</span>
            <WeatherGlyph icon={weatherIcon(hour.weatherCode)} className={styles.hourGlyph} />
            {wet && <span className={styles.hourRain}>{rain ? `${rain}%` : ""}</span>}
            {/* Both lines are drawn on a wet card even where the lower one comes
                to nothing, so that the warmth keeps one height down the whole
                tile: a row that dropped the empty line would lift its pale one to
                the middle and put a kink in a curve that has none. */}
            <span className={styles.hourLines}>
              <span className={styles.hourWarmth} style={{ width: `${share(hour.temperature)}%` }} />
              {wet && <span className={styles.hourChance} style={{ width: `${rain}%` }} />}
            </span>
            <span className={styles.hourTemp}>{temperature === null ? "" : `${temperature}°`}</span>
          </li>
        );
      })}
    </ul>
  );
}
