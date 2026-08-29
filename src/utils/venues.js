import { useSyncExternalStore } from "react";

// Where the food and café cards put what they found, so the map can draw the
// same list on the ground.
//
// A store rather than a prop, because the two ends of this are not related on
// the page. The cards are tiles the reader can grow, drag to another page of the
// strip or take off the dashboard altogether, and the map is a tile like any
// other beside them; handing the rows from one to the other would mean routing
// them up through the page and back down, and the page has no interest in them.
// Same shelf as the layout and the units next door (see utils/cards.js), and the
// same kind of thing: something one part of the dashboard decided that another
// part has to know.
//
// It is also what keeps the upstream honest. Overpass is a public instance on a
// rate limit (see server/geo.js), and nothing in here ever fetches: a pin is a
// row some card has already asked for. So the pins are on the map exactly when
// the list is on the page — a reader carrying neither card gets neither, and lo
// asks nobody anything, which is the right answer to a question nobody put.

// One empty array for every empty answer, so that "nothing here" keeps the same
// identity from render to render. useSyncExternalStore reads a changed snapshot
// as something having happened, and a fresh [] each time would be a redraw of
// every marker on the map on every render of the page.
const EMPTY = [];

let byKind = { food: EMPTY, cafe: EMPTY };
let published = EMPTY;
const listeners = new Set();

function subscribe(onChange) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function snapshot() {
  return published;
}

// Said by a card when its list lands, and with nothing when the card goes: a
// tile taken off the dashboard takes its pins with it.
//
// The kind is written onto every row on the way through. What comes back out is
// one list and not two, because the map draws one kind of thing — a place on the
// ground — and which of the two cards it came from is a property of the place
// rather than a second list to keep.
export function publishVenues(kind, items) {
  const rows = Array.isArray(items) && items.length > 0 ? items.map((item) => ({ ...item, kind })) : EMPTY;
  // Clearing what is already clear is not an event. Worth saying outright: the
  // card clears on unmount, and without this a card that never loaded anything
  // would still redraw the map on its way off the page.
  if (byKind[kind] === rows) return;
  byKind = { ...byKind, [kind]: rows };
  published = byKind.food.length + byKind.cafe.length > 0 ? [...byKind.food, ...byKind.cafe] : EMPTY;
  for (const listener of listeners) listener();
}

export function useVenues() {
  return useSyncExternalStore(subscribe, snapshot);
}

// The amenities the server asks OpenStreetMap about, and nothing else: a tag lo
// has a word for is a tag lo can show in the reader's language, and one it does
// not is left off rather than printed as the slug it arrived as.
const CATEGORIES = new Set(["restaurant", "fast_food", "food_court", "cafe"]);

// The two that say nothing when there is a cuisine to say instead — see below.
const PLAIN = new Set(["restaurant", "cafe"]);

// What a place says about itself besides its name, which is at most two words.
//
// The cuisine leads, because it is the thing that tells one from the next: down
// a list where nearly every line is a restaurant, "Restaurant" is the part
// carrying no information. The amenity is set beside it only where it carries
// some of its own — a counter you eat at standing up is a different evening from
// a table you sit down at — and otherwise stands in for a cuisine nobody has
// filled in.
//
// The cuisine itself is left in the words the mappers wrote it in, less the
// underscores, which are the file format showing through. There is no closed
// list of them to translate against, and a guessed translation of somebody's
// kitchen is worse than their own plain word for it.
//
// Here rather than in the card because the map says it too, in the bubble on a
// pin. The rule is editorial — which of two words earns the room — and a rule
// like that kept in two places is one that gets changed in one of them.
export function venueParts(item, t) {
  const cuisine = (item.cuisine || "").replace(/_/g, " ");
  const named = CATEGORIES.has(item.category);
  const shown = named && (!cuisine || !PLAIN.has(item.category));
  return { category: shown ? t(`venues.category.${item.category}`) : "", cuisine };
}
