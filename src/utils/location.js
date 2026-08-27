// The one piece of state the whole app hangs off. Every card — clock, weather,
// nearby, map — is a different reading of the fix held here, so there is exactly
// one store, one permission prompt and one position in flight at a time.
//
// Status is one of:
//   "idle"        nothing asked for yet — the gate screen is showing
//   "locating"    a fix has been requested and has not come back
//   "ready"       coords are good
//   "denied"      the browser said no
//   "unsupported" this device has no geolocation at all
//   "error"       the device tried and failed (no signal, timeout)

const ENABLED_KEY = "lo:locationEnabled";
const LAST_FIX_KEY = "lo:lastFix";
const FRESH_MS = 60000; // a fix this recent is reused instead of re-asked
const REQUEST_TIMEOUT_MS = 15000;

const listeners = new Set();
let inFlight = null;

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
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // best effort — the choice just won't survive a reload
  }
}

// The last fix comes back from storage so a reload can draw the map straight
// away, marked stale until the device confirms it is still where it was.
function restoreLastFix() {
  const raw = readStored(LAST_FIX_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Number.isFinite(parsed?.latitude) || !Number.isFinite(parsed?.longitude)) return null;
    // Everything else here survives being put away and taken out again: where the
    // phone was is still where it was, marked stale. A speed does not — it is a
    // claim about a moment rather than about a place, and the moment has passed.
    return { ...parsed, speed: null };
  } catch {
    return null;
  }
}

const restored = restoreLastFix();

let state = {
  status: restored ? "ready" : "idle",
  coords: restored,
  at: restored?.at ?? 0,
  stale: Boolean(restored),
  error: null,
};

function emit(next) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribeLocation(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLocationState() {
  return state;
}

export function isLocationEnabled() {
  return readStored(ENABLED_KEY) === "yes";
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function readPosition(highAccuracy) {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          coords: {
            latitude: round(position.coords.latitude, 6),
            longitude: round(position.coords.longitude, 6),
            accuracy: Number.isFinite(position.coords.accuracy) ? round(position.coords.accuracy, 1) : null,
            // Metres above sea level, and null far more often than not: only a
            // device with a GPS worth the name answers this, and a browser
            // placing itself off wifi has nothing to say about height at all.
            // Carried here rather than read for itself, because it is part of
            // the same fix — see CompassCard, which is where it is read.
            altitude: Number.isFinite(position.coords.altitude) ? round(position.coords.altitude, 1) : null,
            // Metres a second, over the ground, and the one figure here that no
            // amount of arithmetic elsewhere can stand in for: an accelerometer
            // is blind to steady movement — a phone carried at a walk is pushed
            // exactly as hard as one lying on a table — so a speed either comes
            // off the GPS or it is not really a speed. Null as often as altitude
            // is and for the same reason, and negative on some devices when they
            // mean they do not know.
            speed:
              Number.isFinite(position.coords.speed) && position.coords.speed >= 0
                ? round(position.coords.speed, 1)
                : null,
            at: Date.now(),
          },
        }),
      (error) => resolve({ error }),
      {
        enableHighAccuracy: highAccuracy,
        timeout: REQUEST_TIMEOUT_MS,
        maximumAge: highAccuracy ? 0 : FRESH_MS,
      },
    );
  });
}

// One shared request: the gate button and four cards mounting at once all wait
// on the same promise rather than asking the device five times.
function requestPosition(highAccuracy) {
  if (inFlight) return inFlight;
  const request = readPosition(highAccuracy).then((result) => {
    inFlight = null;
    if (result.coords) {
      writeStored(LAST_FIX_KEY, JSON.stringify(result.coords));
      emit({ status: "ready", coords: result.coords, at: result.coords.at, stale: false, error: null });
    } else {
      const denied = result.error?.code === result.error?.PERMISSION_DENIED;
      if (denied) writeStored(ENABLED_KEY, "no");
      emit({
        // A refused prompt is final; a failed one still leaves whatever fix we
        // already had on screen rather than blanking every card.
        status: denied ? "denied" : state.coords ? "ready" : "error",
        stale: denied ? state.stale : true,
        error: denied ? "denied" : "failed",
      });
    }
    return result;
  });
  inFlight = request;
  return request;
}

// Called by the gate button, and on boot when permission was already granted.
export async function enableLocation({ highAccuracy = true } = {}) {
  if (!navigator.geolocation) {
    emit({ status: "unsupported", error: "unsupported" });
    return "unsupported";
  }
  writeStored(ENABLED_KEY, "yes");
  if (state.status !== "ready") emit({ status: "locating", error: null });
  const { error } = await requestPosition(highAccuracy);
  if (!error) return "ready";
  return error.code === error.PERMISSION_DENIED ? "denied" : "error";
}

export function refreshLocation() {
  if (!isLocationEnabled() || !navigator.geolocation) return Promise.resolve("off");
  if (!state.coords) emit({ status: "locating", error: null });
  return requestPosition(true).then(({ error }) => (error ? "error" : "ready"));
}

export function disableLocation() {
  writeStored(ENABLED_KEY, "no");
  writeStored(LAST_FIX_KEY, null);
  emit({ status: "idle", coords: null, at: 0, stale: false, error: null });
}

// On boot: if the browser already remembers a grant, skip the gate entirely and
// go straight for a fix. Chrome and Safari both answer this without prompting.
export async function resumeLocation() {
  if (!navigator.geolocation) {
    emit({ status: "unsupported", error: "unsupported" });
    return;
  }
  if (!isLocationEnabled()) return;
  if (navigator.permissions?.query) {
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      if (permission.state === "denied") {
        emit({ status: "denied", error: "denied" });
        return;
      }
    } catch {
      // Firefox before 100 has no geolocation permission descriptor — just ask
    }
  }
  enableLocation({ highAccuracy: false });
}

export function isFresh() {
  return state.coords ? Date.now() - state.at < FRESH_MS : false;
}

// Two decimals is about a kilometre. The fix itself is a new object on every
// reading of the sensor, which would make an effect keyed on it run every
// minute; keyed on this, it runs when the answer would actually be different —
// walking down the street does not change the weather, the place name, or which
// posts are near enough to be worth drawing.
const COORD_PRECISION = 2;

export function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(COORD_PRECISION)},${coords.longitude.toFixed(COORD_PRECISION)}`;
}
