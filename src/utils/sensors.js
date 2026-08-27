import { useEffect, useSyncExternalStore } from "react";

// The instruments in the handset itself. Where you are is the fix and has a store
// of its own (see utils/location.js); this is the other half of the same
// question — not where the phone is but how it is being held. Which way it
// points, how it is being pushed, how it is being turned.
//
// One store, for the reasons there is one for the fix: the browser hands these
// readings out as events sixty times a second, iOS asks the reader's permission
// before it hands out any of them at all, and two cards reading the same
// instruments should read the same numbers rather than each start a listener.
//
// Status is one of:
//   "idle"        nothing attached — the card is offering the button
//   "asking"      the permission sheet is up (iOS only)
//   "listening"   attached, nothing has arrived yet
//   "on"          readings are coming in
//   "denied"      the reader said no
//   "unsupported" nothing behind the events — a desktop, or a page not on https

const GRANT_KEY = "lo:sensorsEnabled";
// Nothing in the first two seconds means nothing is coming. A browser with no
// instruments behind these events does not refuse and does not fail: it simply
// never fires one, so silence is the only answer it gives and it has to be read
// as one.
const SILENCE_MS = 2000;
// Ten readings a second. They arrive at sixty, and a dial that turns and three
// figures that jitter are none the better for the other fifty — every one of
// them would be a render of the whole card.
const EMIT_MS = 100;

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage walled off (Safari private browsing) — nothing was remembered
    return null;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best effort — the reader is asked again next time instead
  }
}

let state = {
  status: "idle",
  // Degrees clockwise from north, where the top of the screen is pointing.
  heading: null,
  headingAccuracy: null,
  // Metres per second squared, gravity included — at rest the three of them add
  // up to about 9.8, which is the reading being right rather than the phone
  // falling.
  acceleration: null,
  // Degrees per second about each of the same three axes.
  rotation: null,
  at: 0,
};

const listeners = new Set();
let holds = 0;
let attached = false;
let silenceTimer = 0;
let flushTimer = 0;
let lastEmit = 0;
let pending = null;

function emit(next) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribeSensors(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSensorState() {
  return state;
}

// iOS is the only place these come with a prompt, and it is a prompt that has to
// be asked for from a press: Safari refuses the ask made anywhere else.
function needsPermission() {
  return typeof window.DeviceOrientationEvent?.requestPermission === "function";
}

function remembered() {
  return readStored(GRANT_KEY) === "yes";
}

// alpha counts anticlockwise from north about the vertical axis, so a heading —
// clockwise, from the top of the screen — is its complement, turned again by
// however far the screen has been rotated inside the case: in landscape the top
// of the screen is not the top of the phone the sensor is bolted to.
function headingFromAlpha(alpha) {
  if (!Number.isFinite(alpha)) return null;
  const angle = window.screen?.orientation?.angle;
  return (360 - alpha + (Number.isFinite(angle) ? angle : 0) + 360) % 360;
}

function onOrientation(event) {
  // Safari answers the compass question directly and its alpha is no use for it.
  // Everywhere else the heading is in alpha and only where the event calls
  // itself absolute: a relative alpha counts from wherever the phone happened to
  // be lying when the page opened, which is a number about nothing.
  const compass = event.webkitCompassHeading;
  const heading = Number.isFinite(compass)
    ? compass
    : event.absolute
      ? headingFromAlpha(event.alpha)
      : null;
  // A relative event carries no heading and must not wipe the one an absolute
  // event left — hence the reading being the fields there are rather than all of
  // them every time.
  if (heading == null) return;
  const accuracy = event.webkitCompassAccuracy;
  stage({
    heading,
    headingAccuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
  });
}

function onMotion(event) {
  const push = event.accelerationIncludingGravity;
  const turn = event.rotationRate;
  const reading = {};
  if (push) reading.acceleration = { x: push.x, y: push.y, z: push.z };
  // rotationRate is filed by the axis each turn is about — beta turns about x,
  // gamma about y, alpha about z — so read out in that order the three figures
  // are the same three axes as the accelerometer's, in the same order.
  if (turn) reading.rotation = { x: turn.beta, y: turn.gamma, z: turn.alpha };
  if (Object.keys(reading).length > 0) stage(reading);
}

// Every event goes into the same pending reading and one of them schedules the
// render. What the card draws is therefore the newest of each instrument at ten
// a second, rather than whichever event happened to be last.
function stage(reading) {
  pending = { ...pending, ...reading };
  if (silenceTimer) {
    window.clearTimeout(silenceTimer);
    silenceTimer = 0;
  }
  if (flushTimer) return;
  flushTimer = window.setTimeout(flush, Math.max(0, EMIT_MS - (Date.now() - lastEmit)));
}

function flush() {
  flushTimer = 0;
  lastEmit = Date.now();
  const reading = pending;
  pending = null;
  if (reading) emit({ status: "on", ...reading, at: lastEmit });
}

function attach() {
  if (attached) return;
  attached = true;
  // Both orientation events, because which one a browser fires is the thing that
  // differs: Chrome has the absolute one and puts the heading there, Safari has
  // only the plain one and puts the compass on it.
  window.addEventListener("deviceorientationabsolute", onOrientation);
  window.addEventListener("deviceorientation", onOrientation);
  window.addEventListener("devicemotion", onMotion);
  if (state.status !== "on") emit({ status: "listening" });
  silenceTimer = window.setTimeout(() => {
    silenceTimer = 0;
    if (state.status === "listening") emit({ status: "unsupported" });
  }, SILENCE_MS);
}

function detach() {
  if (!attached) return;
  attached = false;
  window.removeEventListener("deviceorientationabsolute", onOrientation);
  window.removeEventListener("deviceorientation", onOrientation);
  window.removeEventListener("devicemotion", onMotion);
  window.clearTimeout(silenceTimer);
  window.clearTimeout(flushTimer);
  silenceTimer = 0;
  flushTimer = 0;
  pending = null;
  // The status is left where it is. Whether the reader has allowed this outlives
  // the card being taken off the page, and the last reading standing is what the
  // card comes back to before the next event lands.
}

// The button in the card, and — where no button is needed — the card arriving on
// the page at all.
export async function startSensors() {
  if (!window.DeviceOrientationEvent && !window.DeviceMotionEvent) {
    emit({ status: "unsupported" });
    return "unsupported";
  }
  if (needsPermission()) {
    emit({ status: "asking" });
    try {
      const asks = [window.DeviceOrientationEvent.requestPermission()];
      if (typeof window.DeviceMotionEvent?.requestPermission === "function") {
        asks.push(window.DeviceMotionEvent.requestPermission());
      }
      const answers = await Promise.all(asks);
      if (answers.some((answer) => answer !== "granted")) {
        writeStored(GRANT_KEY, "no");
        emit({ status: "denied" });
        return "denied";
      }
    } catch {
      // Safari throws rather than prompts when the ask did not come from a
      // press, which is exactly what the resume below is. That is not a refusal,
      // so the button goes back rather than a blocked message: the next ask
      // comes from a finger and gets a prompt.
      emit({ status: "idle" });
      return "idle";
    }
  }
  writeStored(GRANT_KEY, "yes");
  attach();
  return "on";
}

// A card on the page is a card listening, for as long as it is on it: these
// events keep a sensor awake, and one left running for a tile the reader has put
// away is battery spent on a number nobody is reading.
function hold() {
  holds += 1;
  // Everywhere but iOS these need no permission, so a card that is on the page
  // simply listens. On iOS the same holds once the reader has said yes before —
  // and if Safari will not take that ask without a press, startSensors puts the
  // button back. A refusal is not asked about again until the reader presses it.
  if (state.status !== "denied" && (!needsPermission() || remembered())) startSensors();
  return () => {
    holds -= 1;
    if (holds <= 0) detach();
  };
}

export function useSensors() {
  const reading = useSyncExternalStore(subscribeSensors, getSensorState);
  useEffect(hold, []);
  return reading;
}
