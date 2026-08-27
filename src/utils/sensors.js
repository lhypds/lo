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
//
// Note what this is not: it is not a way of quieting the figures. Every sample
// is worked into the numbers below as it lands and only the drawing is thinned
// to ten a second, because taking one sample in six and throwing the rest away
// is reading the noise rather than the movement — see the filters.
const EMIT_MS = 100;

// How long the turn rate takes to follow the phone being turned. The gyroscope's
// own noise is a few degrees a second and it is a different few every sample; a
// third of a second of them averaged is the hand rather than the instrument.
const TURN_TAU_MS = 300;
// And under this the phone is being held rather than turned. A hand meaning to
// be still never quite is, and a figure flickering between two and five while
// nothing at all is happening reads as an instrument that cannot make its mind
// up — which is the one thing a reading must never look like.
const TURN_STILL_DPS = 3;

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
  // Degrees a second, about all three axes at once and smoothed.
  turnRate: null,
  at: 0,
};

// No speed here, and it is worth saying why not, because the accelerometer looks
// like the instrument for it and is not. What that instrument measures is force,
// and steady movement has none: a phone carried at a walk is being pushed exactly
// as hard as one lying on a table. A speed can be got out of it only by taking
// gravity off every sample and adding up what is left, and that has two faults
// that cannot both be fixed at once — the filter separating gravity from movement
// also eats any push lasting longer than itself, and the adding up keeps every
// sample's error for ever. Tuned as well as it goes, a real two metres a second
// reads about one, and coasting reads nothing at all.
//
// So the speed on the direction card comes off the GPS instead, which measures it
// over the ground and is the only thing here that does (see utils/location.js).

const listeners = new Set();
let holds = 0;
let attached = false;
let silenceTimer = 0;
let flushTimer = 0;
let lastEmit = 0;
let pending = null;

// What the turn-rate filter carries between samples.
let motionAt = 0;
let turnRate = null;

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
  const turn = event.rotationRate;
  if (!turn) return;
  const now = Date.now();
  // Every sample is worked in, however fast they arrive; only the drawing is
  // thinned to ten a second. The first sample after an attach has no interval
  // behind it, and neither has the first one back after the page was put away —
  // both seed the filter rather than move it, which is what a long gap should do.
  const step = motionAt ? now - motionAt : 0;
  motionAt = now;
  stage({ turnRate: smoothTurn(turn, step) });
}

// The fraction an exponential average moves by, worked out from how long it has
// been rather than fixed. These events fire at anything from thirty a second to
// a hundred depending on the handset, and a fixed fraction would mean the same
// filter settling three times faster on one phone than on another — the reading
// would be as much a fact about the device as about the hand holding it.
function ease(step, tau) {
  return 1 - Math.exp(-step / tau);
}

// rotationRate is filed by the axis each turn is about — beta turns about x,
// gamma about y, alpha about z — and the three together are the one figure the
// card wants: how fast the thing is being turned, whichever way it is being
// turned. Averaged, and then held at zero until it means something, because the
// raw figure never sits still for two samples running.
function smoothTurn(turn, step) {
  const rate = Math.hypot(
    ...["beta", "gamma", "alpha"].map((axis) => (Number.isFinite(turn[axis]) ? turn[axis] : 0)),
  );
  turnRate = turnRate == null ? rate : turnRate + (rate - turnRate) * ease(step, TURN_TAU_MS);
  return turnRate < TURN_STILL_DPS ? 0 : turnRate;
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
  // The filter goes with it: an average is a statement about a stretch of time,
  // and the stretch has just ended.
  motionAt = 0;
  turnRate = null;
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
