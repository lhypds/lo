import { distanceMeters } from "./format.js";
import { framed } from "./host.js";

// Past this, a route is not a walk however willing a router is to draw one — ask
// for a walk between two cities and it answers with a nine-hour footpath along
// the shoulder of a trunk road. Under it, driving is the wrong answer for the
// opposite reason: a spot two streets away is a walk, and the driving line goes
// the long way round every one-way system to get there.
const WALKING_LIMIT_M = 3000;

// A phone or a tablet, which is the whole question here: everything else gets a
// new tab. iPadOS has called itself a Mac since 13, and the touch points are the
// only thing left that gives it away.
function handheld() {
  if (typeof navigator === "undefined") return false;
  if (/Android|iPhone|iPod/i.test(navigator.userAgent)) return true;
  return /Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

// Google's cross-platform directions URL. Deliberately the plain https one
// rather than comgooglemaps:// or an Android intent://: those two exist because
// a *script* cannot reach an installed app, and nothing here is a script — the
// control is a real anchor, and a tapped link is exactly what iOS and Android
// hand to Google Maps themselves. On a desktop, where there is no app to hand it
// to, the same URL is the directions page.
export function directionsUrl(to, from = null) {
  const query = new URLSearchParams({
    api: "1",
    destination: `${to.latitude},${to.longitude}`,
  });
  // No fix in hand is no reason to refuse: with no origin, Maps routes from
  // wherever the device says it is, which is the answer lo would have given it.
  if (from) {
    query.set("origin", `${from.latitude},${from.longitude}`);
    query.set("travelmode", distanceMeters(from, to) <= WALKING_LIMIT_M ? "walking" : "driving");
  }
  return `https://www.google.com/maps/dir/?${query}`;
}

// The coordinate-only version of the other question to ask about a spot: not
// "take me there" but "what is here". This is the fallback for a mark nobody
// named; a named mark goes through placeSearchUrl below so its label is the
// search and these coordinates only keep that search on the right ground.
export function searchUrl(to) {
  const query = new URLSearchParams({ api: "1", query: `${to.latitude},${to.longitude}` });
  return `https://www.google.com/maps/search/?${query}`;
}

// Close enough that the neighbouring streets are in the picture and no further.
// What the viewport below is for is telling two shops of the same name apart,
// and the one this is about is a few hundred metres off at most.
const SEARCH_ZOOM = 17;

// The same question asked about a place that arrived with a name already on it —
// a restaurant out of OpenStreetMap rather than a spot the reader kept — and
// asked the other way round, because here the name is the better of the two
// things to search on. Coordinates put Google on the right pavement and it
// answers with a pin and a line of numbers; the name is what fetches the card
// with the hours, the photographs and whether it is open now, which is the whole
// of what this word is pressed for.
//
// Both, in fact. The query is the name and the map is centred where the place
// actually stands, in the URL form that carries a viewport. A name on its own is
// searched wherever Google supposes the reader to be, and "Starbucks" would come
// back as whichever one it liked rather than the one two streets away that the
// row was about. Not the api=1 form used above: that one takes a query and a
// Google place id, and lo has no place ids to give it — the ids on these rows
// are OpenStreetMap's.
export function placeSearchUrl(to) {
  // A place with no name is every mark and no venue: the Overpass query behind
  // these lists asks for named things only (see lookupVenues in server/geo.js).
  // Still worth answering, and the coordinates are the answer.
  if (!to.name) return searchUrl(to);
  const where = `@${to.latitude},${to.longitude},${SEARCH_ZOOM}z`;
  return `https://www.google.com/maps/search/${encodeURIComponent(to.name)}/${where}`;
}

// Spread onto whatever opens either of them. A new tab on a desktop, so lo is
// still sitting there behind Google Maps; the same tab on a handheld, where
// target="_blank" is the known way to stop Safari passing a link to the app, and
// where coming back is a gesture rather than a tab to go and find.
function mapsLink(href) {
  // Inside a frame the bare href is a dead end: it would navigate the frame in
  // place onto Google's frame-ancestors wall, which refuses to draw Maps inside
  // a foreign frame, and the reader gets a blank pane instead of directions. lo
  // lives in exactly that frame under the Even Hub WebView (see utils/host.js),
  // so a framed link opens a browsing context of its own — a new tab on a
  // desktop, the way out of the frame on a handheld — the same as a desktop tab
  // does, rather than trusting the handheld shortcut that stays in place.
  if (framed()) return { href, target: "_blank", rel: "noopener noreferrer" };
  return handheld() ? { href } : { href, target: "_blank", rel: "noopener noreferrer" };
}

export function directionsLink(to, from = null) {
  return mapsLink(directionsUrl(to, from));
}

export function searchLink(to, label = "") {
  const name = String(label).trim();
  return mapsLink(name ? placeSearchUrl({ ...to, name }) : searchUrl(to));
}

export function placeSearchLink(to) {
  return mapsLink(placeSearchUrl(to));
}
