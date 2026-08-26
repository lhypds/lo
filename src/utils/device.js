import { useSyncExternalStore } from "react";

// What "a phone" means to lo, in the only two terms a browser will answer in: a
// window too narrow for a sheet to be anything but the whole of it, or a screen
// the finger is the pointer on. The second half is what catches a phone held
// sideways and a tablet, where there is room for a sheet but the keyboard still
// slides up over the page instead of taking its room out of the window — which
// is the thing a sheet cannot survive and the page is built for.
//
// 560px is the width the sheets already use for a phone, so the two agree.
const HANDHELD = "(max-width: 560px), (hover: none) and (pointer: coarse)";

let media = null;

// Asked for on the first read rather than at import: this is a browser fact, and
// nothing should be measured before there is a window to measure.
function list() {
  if (!media) media = window.matchMedia(HANDHELD);
  return media;
}

function subscribe(onChange) {
  list().addEventListener("change", onChange);
  return () => list().removeEventListener("change", onChange);
}

// Answered again when it changes — a desktop window dragged narrow is a
// different answer, and whatever asked should get it rather than keep the one it
// was mounted with.
export function useHandheld() {
  return useSyncExternalStore(subscribe, () => list().matches);
}

// Which phone, which is a different question from the one above and asked for a
// different reason: what the bottom edge of the window is made of. On iOS it is
// the edge of the phone, curved, with a home bar over it; on Android the keys
// and the browser's chrome take their own room and leave a straight one. There
// is no media query for this — the insets and the corner both describe the
// window, not the glass — so it is the user agent or nothing.
//
// iPadOS has called itself a Mac since 13, and the touch points are the only
// thing left that gives it away (see utils/maps, which asks its own version of
// this question about handing a link to an app).
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return /Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}
