import { useSyncExternalStore } from "react";

// Where the Wikipedia card puts what it found, so the map can draw the same
// pins on the ground — the same arrangement the food and café cards use for
// the same reason (see utils/venues.js): the map is a tile on the grid like
// any other, and routing these rows up through the page and back down again
// would be routing them through something that has no interest in them.
//
// Kept apart from venues.js rather than folded into it: this is one list, not
// two kept apart by kind and merged for the map, and there is no third kind
// for publishVenues' own merge to learn about. A landmark does carry a running
// conversation of lo's own — see updateWikiComments below, which is
// updateVenueComments' own trick for the one field that changes underneath a
// row that has otherwise already landed.

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

// A comment written from a map popup or the card's own preview changes lo's
// own figure, not anything Wikipedia holds. Put that one field back into the
// published copy immediately so the pin behind the sheet is redrawn with the
// new count, the way updateVenueComments does for a café or restaurant — the
// card's next server answer will carry the same figure from the database and
// take over normally.
export function updateWikiComments(id, comments) {
  if (!published.some((item) => item.id === id)) return;
  published = published.map((item) => (item.id === id ? { ...item, comments } : item));
  for (const listener of listeners) listener();
}

// The other half of a landmark's picture, for the one place it is looked at
// properly — postPhoto's own trick (see utils/image.js), handed to the same
// Lightbox. A pair here as well, though lo stores neither of them: Wikimedia
// renders a picture at any of its listed widths off the same path, so the small
// one is the same picture asked for at 120px (see smallThumbnail in
// server/geo.js) and it does exactly what a post's thumbnail does — fills the
// box while the big one comes, having very often already been fetched for the
// row or the pin that was pressed to get here. The box it opens in is sized
// from the two numbers MediaWiki answered the big one with.
export function wikiPhoto(place) {
  if (!place?.thumbnail) return null;
  return {
    src: place.thumbnail,
    thumb: place.thumbnailSmall || null,
    width: place.thumbnailWidth ?? null,
    height: place.thumbnailHeight ?? null,
  };
}
