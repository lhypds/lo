import { useSyncExternalStore } from "react";

// Where the history card puts the old photographs it found, so the map can pin
// each one where the camera stood — wikiPlaces' arrangement exactly, for
// wikiPlaces' reasons (see utils/wikiPlaces.js), and a store of its own for
// venues.js's reason: two cards publishing into one shelf would each be
// clearing the other's rows on the way past.
//
// The rows are stamped `kind` on the way through, the way the venue store
// stamps its two: the page lays this list and the landmarks on the map as one
// layer (see HomePage), and which pin a row gets is a property of the row
// rather than a second list to keep. Everything else about a row is already in
// the wiki rows' own shape — title, distance, picture, comments — which is
// what lets the map's one landmark path draw both (see wikiPopupElement in
// MapCard, and wikiPhoto in utils/wikiPlaces.js, which reads these rows too).

const EMPTY = [];
let published = EMPTY;
const listeners = new Set();

function subscribe(onChange) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function snapshot() {
  return published;
}

// Said by the card when its list lands, and with nothing when the card goes: a
// tile taken off the dashboard takes its pins with it.
export function publishHistoryPlaces(items) {
  const rows =
    Array.isArray(items) && items.length > 0 ? items.map((item) => ({ ...item, kind: "history" })) : EMPTY;
  if (published === rows) return;
  published = rows;
  for (const listener of listeners) listener();
}

export function useHistoryPlaces() {
  return useSyncExternalStore(subscribe, snapshot);
}

// A comment written from a map popup or the card's own preview changes lo's
// own figure, not anything Commons holds — updateWikiComments' trick, on this
// shelf (see utils/wikiPlaces.js).
export function updateHistoryComments(id, comments) {
  if (!published.some((item) => item.id === id)) return;
  published = published.map((item) => (item.id === id ? { ...item, comments } : item));
  for (const listener of listeners) listener();
}
