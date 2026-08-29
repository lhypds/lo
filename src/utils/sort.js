import { distanceMeters } from "./format.js";

// The other question to ask of a list that is already in hand. Searching says
// which rows; this says which of them first — and for the same reason the search
// asks nothing of the server, neither does this: both lists are short and already
// here, so the order changes on the press rather than after it.
//
// Two things a row is remembered by, and three answers between them, which is
// what a mark and a post have in common — both are a spot and a moment, and
// nothing else about them is shared. Distance has one direction worth offering:
// furthest-away first is a list nobody asks for.
export const SORTS = ["nearest", "latest", "oldest"];

// The order the server already hands both lists over in, and so the one nothing
// has to be pressed to get: the newest thing at the top, which is where a reader
// looks for what has just happened.
export const DEFAULT_SORT = "latest";

// A row with an unreadable time sinks rather than scattering the list: a NaN on
// either side of a comparison makes the whole sort's answer undefined, and one
// bad timestamp is not worth the other rows' order.
function stamp(iso) {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

// `from` is where the reader is standing, and the whole of what "nearest" means.
// Without it — the marks list can be read before the browser has answered about
// position — there is no near and no far, so the list is left as it was found.
export function sortRows(items, sort, from) {
  if (sort === "nearest") {
    if (!from) return items;
    // Measured once per row rather than inside the comparison, which asks for
    // every distance again on every pair it looks at.
    return items
      .map((item) => ({ item, away: distanceMeters(from, item) }))
      .sort((a, b) => a.away - b.away)
      .map((measured) => measured.item);
  }
  // Sorted the way it is asked for rather than sorted one way and turned round:
  // the sort is stable, and reversing it would take two rows left at the same
  // second and swap them for no reason the reader could see.
  return [...items].sort((a, b) =>
    sort === "oldest" ? stamp(a.time) - stamp(b.time) : stamp(b.time) - stamp(a.time),
  );
}
