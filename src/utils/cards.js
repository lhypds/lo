import { useSyncExternalStore } from "react";

// How much of the grid a panel covers, counted in squares. Two is the width of
// the panel column — the whole grid on a phone, half of it on a laptop — one
// tile tall; four is that same width and twice the height, which is the largest
// tile the grid has. Nothing in between, because anything in between is off the
// module the whole page is drawn on (see .card-grid in styles.css).
export const SMALL = 2;
export const LARGE = 4;
const SIZES = [SMALL, LARGE];

// Which cards the dashboard is carrying. Two questions decide it and only one of
// them is the reader's: whether the place can feed a card at all is the server's
// answer — see server/countries.js — and which of the ones it can feed are worth
// the room is this. A card has to pass both to be on the page.
//
// The ids are the server's own words for the same things, so the two questions
// are asked in one vocabulary. That is why the news card answers to `nearby`
// here: that is the name of the feed behind it. The two marked `own` are lo's
// own — posts and people stop at no border — so there is nothing on the server
// to ask about them.
//
// `label` is the card's own heading rather than a name invented for the menu:
// the menu is a list of the things on the page, and a second name for a tile the
// reader can already see would be a second thing to learn.
//
// `off` is a card that arrives off the page. What lo opens as is the 2x2 block
// and nothing else: the clock, the weather, the map, and the button that keeps
// where you are standing — the time here, the sky here, the ground here, and the
// one thing you can do about any of it. Everything under that block is a reading
// of a wider place than the one you are in, and which of those readings are
// worth the room is not a question lo can answer for a reader it has not met:
// the plus in the top bar is where they answer it, and a dashboard that starts
// at four squares is a page that asks rather than one that has to be cleared.
//
// Nothing here says how tall a panel stands, because every panel still starts at
// two squares; one that should arrive taller can say so when there is one. What
// the reader does from either default — a card added, a panel given four squares
// — is the only thing the layout below remembers.
//
// The clock, the weather and the map are single squares and never resize: those
// three with the mark button are the 2x2 block the rest of the grid is set
// against.
export const CARDS = [
  { id: "clock", label: "clock.title" },
  { id: "weather", label: "weather.title" },
  { id: "map", label: "map.title" },
  { id: "posts", label: "posts.nearby", own: true, off: true },
  { id: "people", label: "people.nearby", own: true, off: true },
  { id: "warnings", label: "warnings.title", off: true },
  { id: "nearby", label: "news.title", off: true },
  { id: "events", label: "events.title", off: true },
  { id: "trends", label: "trends.title", off: true },
];

const BY_ID = new Map(CARDS.map((card) => [card.id, card]));

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
      if (Object.keys(choice).length > 0) kept[id] = choice;
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

function sizeOf(choices, id) {
  return choices[id]?.size ?? SMALL;
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
  decide(id, { on: !isOn(decided, id) });
}

export function resizeCard(id, size) {
  if (SIZES.includes(size)) decide(id, { size });
}

// One panel's own height, for the panel and for the pair of buttons in its
// heading. Asked by id rather than handed down through the page, so how tall a
// panel stands is between it and the layout — nothing above it has to hold a
// size for it, and the buttons that change it need no route back up.
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
    toggle: toggleCard,
  };
}
