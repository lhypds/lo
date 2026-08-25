import { distanceMeters } from "./format.js";

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

// Spread onto whatever opens it. A new tab on a desktop, so lo is still sitting
// there behind Google Maps; the same tab on a handheld, where target="_blank" is
// the known way to stop Safari passing a link to the app, and where coming back
// is a gesture rather than a tab to go and find.
export function directionsLink(to, from = null) {
  const href = directionsUrl(to, from);
  return handheld() ? { href } : { href, target: "_blank", rel: "noopener noreferrer" };
}
