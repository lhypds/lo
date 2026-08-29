import { useSyncExternalStore } from "react";

// How much of the grid a panel covers, counted in squares. One is the square the
// clock and the weather stand in, the smallest tile there is; two is the width of
// the panel column — the whole grid on a phone, half of it on a laptop — one tile
// tall; four is that same width and twice the height; six is that width three
// tiles tall, the tallest thing on the grid. Nothing in between, because anything
// in between is off the module the whole page is drawn on (see .card-grid in
// styles.css).
export const TINY = 1;
export const SMALL = 2;
export const LARGE = 4;
export const TALL = 6;
const SIZES = [TINY, SMALL, LARGE, TALL];

// Which cards the dashboard is carrying. Two questions decide it and only one of
// them is the reader's: whether the place can feed a card at all is the server's
// answer — see server/countries.js — and which of the ones it can feed are worth
// the room is this. A card has to pass both to be on the page.
//
// The ids are the server's own words for the same things, so the two questions
// are asked in one vocabulary. That is why the news card answers to `nearby`
// here: that is the name of the feed behind it. The three marked `own` are lo's
// own — posts and people stop at no border, and the bearing is a reading of the
// handset rather than of the ground — so there is nothing on the server to ask
// about them.
//
// `label` is the card's own heading rather than a name invented for the menu:
// the menu is a list of the things on the page, and a second name for a tile the
// reader can already see would be a second thing to learn.
//
// `off` is a card that arrives off the page. What lo opens as is squares: the
// clock, the weather, the map and the button that keeps where you are standing —
// the time here, the sky here, the ground here, and the one thing you can do
// about any of it — and under them the two questions a page about where you are
// standing should not have to be asked for, who is around and what is in force.
// Those two are squares as well, which is what lets them arrive at all: at the
// width of the panel column they would have been two more rows to scroll past on
// a phone, and at a square each they are one row that answers both.
//
// Everything still off the page is a reading of a wider place than the one you
// are in, and which of those readings are worth the room is not a question lo can
// answer for a reader it has not met: the plus in the top bar is where they
// answer it, and a dashboard that starts as a block of squares — six of them
// where the country can feed the warnings, five where it cannot — is a page that
// asks rather than one that has to be cleared.
//
// `min` is the smallest a panel can be cut to, and also the size it arrives at: a
// panel is offered at its smallest and grows if the reader wants it to. Every
// card says `min: TINY`, so the dashboard is a grid of squares and nothing else
// until the reader asks for otherwise.
//
// That is the whole shape of the thing. lo opens as blocks — the time, the sky,
// the ground, the button, who is around, what is in force — and a panel added
// from the plus arrives as one more block beside them rather than as a strip
// thrown across the column. Which of them is worth a second tile is a question
// about that reader on that day, and the pair of buttons in every heading is
// where they answer it; a page that arrives already answering it for them is a
// page that has to be cleared before it can be read.
//
// What it costs is the second thing on each row, never the first, and each panel
// gives up its own second thing in its own stylesheet. The posts panel keeps the
// thumbnail and a line of what was written and drops the age. Food and cafés
// stack the name over the distance rather than setting them side by side. The
// newswire and what is on this week keep the headline and drop the publisher.
// The trending list keeps the rank and the word and drops the story under it and
// the volume beside it. In each case the row still answers the question the card
// is for, which is the test a panel has to pass to be allowed down here at all —
// and a panel that cannot pass it has no business being on a dashboard made of
// squares.
//
// So the `?? SMALL` in cardSizes is a default that nothing now takes, and it
// stays all the same: it is the answer for a card that has not said, and a card
// that has not said is one whose rows nobody has yet cut to a cube. Better that
// a new panel starts a rung up than that it inherits a size it was never drawn
// for.
//
// What the reader does from here — a card added, a panel given more room — is the
// only thing the layout below remembers.
//
// `max` is the other end of the same ladder, and it is six squares — a third tile
// down, the tallest thing on the grid — unless a card says otherwise. Every panel
// that holds a list ends up there, because every one of them is a window onto more
// rows than it shows: the newswire and what is on this week arrive long, the posts
// around here run to as many as the street has left, and the trending list is ten
// by definition. Which of those readings is worth a third tile is the reader's
// answer and not the feed's, so the rung is offered on all of them and none of
// them arrives at it — the ladder is climbed from the bottom or not at all.
//
// The panels that are not lists say `max: TINY` instead, which with the same
// `min` is a card that cannot be resized at all: a count of people, a warning or
// none, the time, the sky, the ground, a needle and three readings off the
// handset. Each of those is a face rather than a window — read at a glance and
// finished — and a second tile under a finished thing is air. The clock, the
// weather and the map are that by nature, and so is the direction tile, which
// stands outside their block on the grid and is the same kind of thing on it.
//
// Such a card says so as a ladder with one rung rather than by leaving the pair
// out: the page has to know how much of the grid every card covers to work out
// where it breaks into pages (see utils/pages.js), and a card that never offers
// the reader a choice of size still has one.
//
// `fixed` is a card that is not the reader's to put away — the mark button, which
// is lo's own doing rather than a reading of anything, and the one tile a
// dashboard you can take every other tile off should still keep. It is in the
// catalog all the same rather than left to the page that draws it, because the
// layout is also where the order of the tiles is kept now that the reader can
// drag them about (see arrangeCards), and a tile left out of the catalog would be
// the one thing on the grid that could not be moved with the rest. Being fixed is
// what keeps it out of the menu: a row that cannot be turned off is a row with
// nothing to press.
export const CARDS = [
  { id: "clock", label: "clock.title", min: TINY, max: TINY },
  { id: "weather", label: "weather.title", min: TINY, max: TINY },
  { id: "map", label: "map.title", min: TINY, max: TINY },
  { id: "mark", label: "mark.button", own: true, fixed: true, min: TINY, max: TINY },
  { id: "people", label: "people.nearby", own: true, min: TINY, max: TINY },
  { id: "warnings", label: "warnings.title", min: TINY, max: TINY },
  { id: "posts", label: "posts.nearby", own: true, off: true, min: TINY },
  { id: "nearby", label: "news.title", off: true, min: TINY },
  { id: "events", label: "events.title", off: true, min: TINY },
  { id: "trends", label: "trends.title", off: true, min: TINY },
  { id: "food", label: "food.title", off: true, min: TINY },
  { id: "cafe", label: "cafe.title", off: true, min: TINY },
  { id: "direction", label: "direction.title", own: true, off: true, min: TINY, max: TINY },
];

const BY_ID = new Map(CARDS.map((card) => [card.id, card]));
const INDEX_BY_ID = new Map(CARDS.map((card, index) => [card.id, index]));

// Everything the reader has decided about the shape of the dashboard — which
// cards are on it and how tall each panel stands — under one key, because it is
// one answer: this is the layout.
const KEY = "lo:layout";

// Only what the reader has actually decided about, never the whole list. A card
// added to lo after a visit then arrives the way that card arrives rather than
// missing from a remembered set: "I put that away" and "that did not exist yet"
// are different answers and a bare list of ids cannot tell them apart.
//
// One record per card rather than one key per question, so a card the reader has
// resized and never hidden reads back as exactly that.
function restore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const kept = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!BY_ID.has(id) || !value || typeof value !== "object") continue;
      const choice = {};
      if (typeof value.on === "boolean") choice.on = value.on;
      if (typeof value.turned === "boolean") choice.turned = value.turned;
      if (SIZES.includes(value.size)) choice.size = value.size;
      if (Number.isSafeInteger(value.added) && value.added > 0) choice.added = value.added;
      if (Number.isSafeInteger(value.rank) && value.rank >= 0) choice.rank = value.rank;
      if (Object.keys(choice).length > 0) kept[id] = choice;
    }

    // Layouts saved before addition order was recorded already have an order on
    // screen: the catalog order. Preserve that as their historical addition
    // order, so the first newly enabled card is appended after them rather than
    // jumping in front on upgrade.
    let nextAdded = Math.max(0, ...Object.values(kept).map((choice) => choice.added ?? 0));
    let migrated = false;
    for (const card of CARDS) {
      if (!card.off || kept[card.id]?.on !== true || kept[card.id]?.added) continue;
      nextAdded += 1;
      kept[card.id] = { ...kept[card.id], added: nextAdded };
      migrated = true;
    }
    if (migrated) {
      try {
        localStorage.setItem(KEY, JSON.stringify(kept));
      } catch {
        // The in-memory migration is still useful for this tab when storage is
        // readable but cannot be written (private modes can behave this way).
      }
    }
    return kept;
  } catch {
    // Nothing decided yet, nothing readable, or storage walled off
    return {};
  }
}

let decided = restore();
const listeners = new Set();

function subscribe(onChange) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function snapshot() {
  return decided;
}

// The reader's own answer where there is one, and the card's where there is not —
// except on the cards that were never the reader's to answer for, which are on
// the page whatever is remembered about them.
function isOn(choices, id) {
  const card = BY_ID.get(id);
  if (card?.fixed) return true;
  return choices[id]?.on ?? !card?.off;
}

// Where the reader has dragged a card to, if they have moved anything. A rank is
// written on every tile that was on the page at the time (see arrangeCards), so a
// card without one is a card that arrived after the last rearrangement: it goes
// to the end, which is where a newly added card goes anyway.
function rankOf(choices, id) {
  return choices[id]?.rank ?? Number.MAX_SAFE_INTEGER;
}

// Every size a panel is offered at, smallest first — the ladder the pair of
// buttons in its heading walks (see CardSize). Both ends are the card's own: the
// bottom rung is `min` and the top is `max`. Which rung it arrives standing on
// is not a separate question any more — it is the bottom one, always, which is
// the whole of what sizeOf below has to work out.
export function cardSizes(id) {
  const card = BY_ID.get(id);
  const min = card?.min ?? SMALL;
  const max = card?.max ?? TALL;
  return SIZES.filter((size) => size >= min && size <= max);
}

// The reader's answer where there is one and the card's own where there is not —
// and the card's own, too, where the remembered size is one this panel does not
// offer: a size stored before the card's own ladder changed is answering a
// question that is no longer being asked.
function sizeOf(choices, id) {
  const sizes = cardSizes(id);
  const chosen = choices[id]?.size;
  // The bottom rung otherwise, for every card there is. A remembered `opens`
  // used to be able to put a panel further up the ladder than this; no card
  // asks for that any more, and a dashboard whose every tile arrives as one
  // square is what took the field away rather than what worked around it.
  return sizes.includes(chosen) ? chosen : sizes[0];
}

// A new object when something changes and the same one in between, which is the
// whole of what useSyncExternalStore reads to decide that anything happened.
//
// As many cards at a time as the decision covers, rather than one: turning a card
// on is a decision about that card, and dragging one across the grid is a
// decision about the line all of them are standing in.
function decide(changes) {
  decided = { ...decided };
  for (const [id, change] of Object.entries(changes)) {
    decided[id] = { ...decided[id], ...change };
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(decided));
  } catch {
    // Best effort: the dashboard is the shape the reader left it in for as long
    // as the tab is open either way
  }
  for (const listener of listeners) listener();
}

export function toggleCard(id) {
  const card = BY_ID.get(id);
  if (card?.fixed) return;
  const on = !isOn(decided, id);
  if (on && card?.off) {
    const added = Math.max(0, ...Object.values(decided).map((choice) => choice.added ?? 0)) + 1;
    decide({ [id]: { on, added } });
  } else {
    decide({ [id]: { on } });
  }
}

export function resizeCard(id, size) {
  if (cardSizes(id).includes(size)) decide({ [id]: { size } });
}

// Which side of a two-sided card is up — at present the clock, whose back is the
// same hour with hands on it (see ClockCard). Kept here with the rest of the
// layout because it is the same kind of answer as how tall a panel stands: a
// thing the reader decided about a tile, which should still be true when they
// come back to the dashboard from another screen. The tile is unmounted while
// they are away, so nothing the card remembers by itself would survive the trip.
export function turnCard(id, turned) {
  if (BY_ID.has(id)) decide({ [id]: { turned } });
}

// Read rather than subscribed to, unlike the size beside it. Once a card is on
// the page the turning is its own — it is an animation with a direction, and a
// side arriving from outside has no direction to come from (see ui/Card) — so
// what this answers is only which face the tile is dealt showing. Which is the
// whole of what is wanted: a tile built again, whether on coming back to the
// dashboard or on being carried to another page of the strip, comes back the way
// it was left.
export function cardTurned(id) {
  return decided[id]?.turned === true;
}

// Where the tiles stand, as ids, first to last — the answer to a card having been
// picked up by its heading and set down somewhere else (see HomePage).
//
// The whole line is written and not only the card that moved, because a rank is a
// place in a line and a line where one card knows its place and the rest do not is
// not one. What is not in the line keeps no rank: a card that was off the page
// when this was decided has no place in it to keep, and comes back at the end the
// way it would have arrived.
export function arrangeCards(ids) {
  const changes = {};
  ids.forEach((id, index) => {
    if (BY_ID.has(id)) changes[id] = { rank: index };
  });
  decide(changes);
}

// A card's own heading, by id — the name the tile carries on the grid, which is
// also what the thing under the finger is called while it is being moved.
export function cardLabel(id) {
  return BY_ID.get(id)?.label;
}

// How the tiles on the grid are told which card each of them is, so that a
// heading that has been held can be answered for with a name, lives with the box
// that reads it: TileId, in ui/Card.

// The same size read as ground on the grid: how many columns across and how many
// rows down the card covers. A single square is one of each; everything else is
// the width of the panel column — the whole grid on a phone, half of it on a
// laptop — and as many rows as it has squares to fill it with. That is the whole
// of what the pages need to know about a card (see utils/pages.js).
export function cardSpan(size) {
  return size === TINY ? { cols: 1, rows: 1 } : { cols: 2, rows: size / 2 };
}

// One panel's own size, for the panel and for the pair of buttons in its heading.
// Asked by id rather than handed down through the page, so how much room a panel
// takes is between it and the layout — nothing above it has to hold a size for
// it, and the buttons that change it need no route back up.
export function useCardSize(id) {
  const choices = useSyncExternalStore(subscribe, snapshot);
  return sizeOf(choices, id);
}

// `supports` is the provider's, passed in rather than read here: this is a
// module of the reader's own choices, and where they are standing is somebody
// else's answer.
export function useCards(supports) {
  const choices = useSyncExternalStore(subscribe, snapshot);
  const offered = (card) => Boolean(card.own) || supports(card.id);
  return {
    // What the plus in the top bar has to offer — every card the place can feed,
    // each with whether it is on the page. A card no country here can answer is
    // not in the menu at all: adding it would put an empty tile on the grid, and
    // neither is one the reader cannot take off, which would be a row with
    // nothing to press.
    cards: CARDS.filter((card) => !card.fixed && offered(card)).map((card) => ({
      ...card,
      on: isOn(choices, card.id),
    })),
    // What the page draws, which is both questions at once: crossing into a
    // country that cannot feed a card takes it off the dashboard without
    // touching what the reader decided about it.
    shown: (id) => {
      const card = BY_ID.get(id);
      return Boolean(card) && offered(card) && isOn(choices, id);
    },
    // How tall the reader has left each panel, asked from the page rather than
    // from inside the card. The card reads its own size for the same store and
    // gets the same answer (useCardSize below); the page needs them all at once
    // because how much of the grid the cards cover between them is what decides
    // where the dashboard breaks into pages.
    size: (id) => sizeOf(choices, id),
    // Optional cards follow the defaults in the order the reader enabled them.
    // Accept whole tile records so the page does not have to sort ids and then
    // rebuild the records it already made.
    inAdditionOrder: (items) =>
      [...items].sort((a, b) => {
        const aOrder = choices[a.id]?.added ?? Number.MAX_SAFE_INTEGER;
        const bOrder = choices[b.id]?.added ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder || (INDEX_BY_ID.get(a.id) ?? 0) - (INDEX_BY_ID.get(b.id) ?? 0);
      }),
    // The line the reader has dragged the tiles into, over the one the page wrote
    // them in. Everything they have moved comes first, in their order; anything
    // they have not — a card added to the dashboard since — keeps the order it
    // came in with, which the sort leaves alone because it is a stable one.
    arrange: (items) => [...items].sort((a, b) => rankOf(choices, a.id) - rankOf(choices, b.id)),
    toggle: toggleCard,
  };
}
