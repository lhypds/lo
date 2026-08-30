import { useSyncExternalStore } from "react";

// Where the Wikipedia card puts what it found, so the map can draw the same
// pins on the ground — the same arrangement the food and café cards use for
// the same reason (see utils/venues.js): the map is a tile on the grid like
// any other, and routing these rows up through the page and back down again
// would be routing them through something that has no interest in them.
//
// Kept apart from venues.js rather than folded into it: a venue carries a
// running conversation of lo's own (see updateVenueComments there), and an
// article carries nothing of lo's on top of it — there is no second field to
// keep in step with a count nobody is keeping, and no third kind for
// publishVenues' two-list merge to learn about.

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

// Said by the card when its list lands, and with nothing when the card goes:
// a tile taken off the dashboard takes its pins with it, the way a food or
// café card's does.
export function publishWikiPlaces(items) {
  const rows = Array.isArray(items) && items.length > 0 ? items : EMPTY;
  if (published === rows) return;
  published = rows;
  for (const listener of listeners) listener();
}

export function useWikiPlaces() {
  return useSyncExternalStore(subscribe, snapshot);
}
