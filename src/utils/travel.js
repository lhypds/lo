// Somewhere to stand other than where the sensor says the reader is. The address
// is the whole of it: /@35.0099022,135.728582 is the dashboard standing on that
// spot, written the way a map's own address writes one, so a link lifted off a
// map is a link lo can open.
//
// The same two numbers are what the travel sheet reads out of whatever is typed
// into it, which is why both readings live here rather than one in the router
// and one in the sheet (see TravelModal).

// Two decimal numbers with a comma or a space between them, an @ in front where
// the text came off a map's address — and the zoom that address carries after
// them (",15z"), which is about the map rather than the place and is let go.
const COORDINATES = /^@?\s*([-+]?\d{1,3}(?:\.\d+)?)\s*(?:,\s*|\s+)([-+]?\d{1,3}(?:\.\d+)?)(?:\s*,\s*\d+(?:\.\d+)?z)?$/i;

// Six places, the precision the sensor's own fixes are kept at (see location.js):
// about a tenth of a metre, and short enough to read in an address.
function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

// A pair of numbers as a spot, or null where they cannot be one.
export function toSpot(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) return null;
  return { latitude: round(lat), longitude: round(lon) };
}

export function readCoordinates(text) {
  const match = COORDINATES.exec(String(text ?? "").trim());
  return match ? toSpot(match[1], match[2]) : null;
}

// The spot an address stands on, or null where it names none — which is every
// address but /@…, and an /@ with no spot after it.
export function travelIn(pathname) {
  if (!pathname.startsWith("/@")) return null;
  try {
    // A link that has been passed through something careful can arrive with its
    // comma written as %2C.
    return readCoordinates(decodeURIComponent(pathname.slice(2)));
  } catch {
    return null;
  }
}

export function travelPath({ latitude, longitude }) {
  return `/@${latitude},${longitude}`;
}
