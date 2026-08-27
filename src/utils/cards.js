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
// own — posts and people stop at no border, and the compass is a reading of the
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
// panel is offered at its smallest and grows if the reader wants it to. Two
// squares unless a card says otherwise, because most of these panels are lists
// that need the width of a line to read; the two that answer at a glance — a
// count of people, a warning or none — say `min: TINY` and can stand in a single
// square. What the reader does from either default — a card added, a panel given
// more room — is the only thing the layout below remembers.
//
// `max` is the other end of the same ladder, and it is six squares — a third tile
// down, the tallest thing on the grid — unless a card says otherwise. Every panel
// that holds a list ends up there, because every one of them is a window onto more
// rows than it shows: the newswire and what is on this week arrive long, the posts
// around here run to as many as the street has left, and the trending list is ten
// by definition. Which of those readings is worth a third tile is the reader's
// answer and not the feed's, so the rung is offered on all of them and none of
// them opens at it.
//
// The two kinds of panel that are not lists say otherwise. The squares are
// `max: TINY`: a count of people or a warning is one line, and room under a line
// is air. The compass is `max: LARGE`, for the far end of the same thought — a
// dial and three readings are a fixed drawing that a third tile would only put
// more paper around.
//
// The clock, the weather and the map are single squares and never resize: those
// three with the mark button are the block the rest of the grid is set against.
// They say so as a ladder with one rung rather than by leaving the pair out —
// the page has to know how much of the grid every card covers to work out where
// it breaks into pages (see utils/pages.js), and a card that never offers the
// reader a choice of size still has one.
export const CARDS = [
  { id: "clock", label: "clock.title", min: TINY, max: TINY },
  { id: "weather", label: "weather.title", min: TINY, max: TINY },
  { id: "map", label: "map.title", min: TINY, max: TINY },
  { id: "people", label: "people.nearby", own: true, min: TINY, max: TINY },
  { id: "warnings", label: "warnings.title", min: TINY, max: TINY },
  { id: "posts", label: "posts.nearby", own: true, off: true },
  { id: "nearby", label: "news.title", off: true },
  { id: "events", label: "events.title", off: true },
  { id: "trends", label: "trends.title", off: true },
  { id: "compass", label: "compass.title", own: true, off: true, max: LARGE },
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
      if (SIZES.includes(value.size)) choice.size = value.size;
      if (Number.isSafeInteger(value.added) && value.added > 0) choice.added = value.added;
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

// The reader's own answer where there is one, and the card's where there is not.
function isOn(choices, id) {
  return choices[id]?.on ?? !BY_ID.get(id)?.off;
}

// Every size a panel is offered at, smallest first — the ladder the pair of
// buttons in its heading walks (see CardSize). Both ends are the card's own: where
// it starts is `min` and where it stops is `max`, and most cards take the defaults
// for both and get the same two rungs everything else has.
export function cardSizes(id) {
  const card = BY_ID.get(id);
  const min = card?.min ?? SMALL;
  const max = card?.max ?? TALL;
  return SIZES.filter((size) => size >= min && size <= max);
}

// The reader's answer where there is one and the card's smallest where there is
// not — and the card's smallest, too, where the remembered size is one this panel
// does not offer: a size stored before the card's own ladder changed is answering
// a question that is no longer being asked.
function sizeOf(choices, id) {
  const sizes = cardSizes(id);
  const chosen = choices[id]?.size;
  return sizes.includes(chosen) ? chosen : sizes[0];
}

// A new object when something changes and the same one in between, which is the
// whole of what useSyncExternalStore reads to decide that anything happened.
function decide(id, change) {
  decided = { ...decided, [id]: { ...decided[id], ...change } };
  try {
    localStorage.setItem(KEY, JSON.stringify(decided));
  } catch {
    // Best effort: the dashboard is the shape the reader left it in for as long
    // as the tab is open either way
  }
  for (const listener of listeners) listener();
}

export function toggleCard(id) {
  const on = !isOn(decided, id);
  const card = BY_ID.get(id);
  if (on && card?.off) {
    const added = Math.max(0, ...Object.values(decided).map((choice) => choice.added ?? 0)) + 1;
    decide(id, { on, added });
  } else {
    decide(id, { on });
  }
}

export function resizeCard(id, size) {
  if (cardSizes(id).includes(size)) decide(id, { size });
}

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
    // not in the menu at all: adding it would put an empty tile on the grid.
    cards: CARDS.filter(offered).map((card) => ({ ...card, on: isOn(choices, card.id) })),
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
    toggle: toggleCard,
  };
}
