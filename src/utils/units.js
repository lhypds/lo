import { useSyncExternalStore } from "react";
import { noteSetting, registerSetting } from "./settings.js";

// How the two figures at the top of the dashboard are read: the clock on a
// twenty-four or a twelve hour dial, the temperature in Celsius or Fahrenheit.
// Neither is a question about the place. The hour in Tokyo is the same hour
// whichever way it is written down and the sky is the same warmth in both
// scales, so nothing here is asked of the server and nothing here is fetched
// again when the answer changes — it is the same reading, said differently.
//
// Which is also why the press is on the figure itself rather than on a setting
// somewhere off the page: the reader is not configuring a card, they are
// turning a number over to look at its other side, and the shortest way to say
// that is to let them do it where the number is.
//
// Kept apart from the layout store next door (see utils/cards.js) on the
// grounds that store gives for what belongs in it: that one is the shape of the
// dashboard — which tiles are on it, how tall each one stands, which way round
// the clock is lying — and this is how to read what is written on two of them.
// Same shelf, different question.
const KEY = "lo:units";

// What lo showed before it could be asked, and so what it goes on showing to
// anyone who does not ask: a 24-hour clock and Celsius. Not the locale's own
// habits, tempting as that is — an en-US reader would be handed 12 hours and
// Fahrenheit — because the language a page is read in is not where its reader
// is standing, and a Fahrenheit reading of the weather in Osaka helps nobody.
// The two presses are cheaper than being guessed wrong at.
const DEFAULTS = { hour12: false, fahrenheit: false };

// The same reading whether it comes off this browser's shelf or out of the
// account's file, so a hand-edited settings.json cannot put anything in here that
// the cards are not expecting.
function read(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULTS;
  return {
    hour12: typeof parsed.hour12 === "boolean" ? parsed.hour12 : DEFAULTS.hour12,
    fahrenheit: typeof parsed.fahrenheit === "boolean" ? parsed.fahrenheit : DEFAULTS.fahrenheit,
  };
}

function restore() {
  try {
    return read(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    // Nothing asked for yet, nothing readable, or storage walled off
    return DEFAULTS;
  }
}

let chosen = restore();
const listeners = new Set();

function subscribe(onChange) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function keep(next) {
  chosen = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(chosen));
  } catch {
    // Best effort: the figures read the way the reader left them for as long as
    // the tab is open either way
  }
  for (const listener of listeners) listener();
}

function decide(change) {
  keep({ ...chosen, ...change });
  // And up, where a press on this figure is a press for the account rather than
  // for the browser it was made in (see utils/settings.js).
  noteSetting("units", chosen);
}

// The account's answer, on signing in. Kept without being sent back: adopting is
// reading the file, not writing it.
registerSetting("units", { read: () => chosen, adopt: (value) => keep(read(value)) });

// Read one at a time rather than as the pair, so that each card is told only
// about its own figure: the clock has no stake in the scale the weather is in.
function hour12Snapshot() {
  return chosen.hour12;
}

function fahrenheitSnapshot() {
  return chosen.fahrenheit;
}

export function useHour12() {
  return useSyncExternalStore(subscribe, hour12Snapshot);
}

export function useFahrenheit() {
  return useSyncExternalStore(subscribe, fahrenheitSnapshot);
}

export function toggleHour12() {
  decide({ hour12: !chosen.hour12 });
}

export function toggleFahrenheit() {
  decide({ fahrenheit: !chosen.fahrenheit });
}

// Celsius to Fahrenheit, which is the whole of the conversion because Celsius is
// the whole of what arrives: lo asks Open-Meteo for nothing else (see
// server/geo.js), so every temperature on the page is one number read two ways
// rather than two numbers fetched.
export function toFahrenheit(celsius) {
  return Number.isFinite(celsius) ? (celsius * 9) / 5 + 32 : celsius;
}
