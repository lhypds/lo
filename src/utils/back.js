// The way back from a profile, and whatever was standing open when the reader
// left for it.
//
// A name pressed inside a sheet is a way through to a person, and the sheet goes
// with the press: what is on the other side is a page, and an exchange left
// standing over the profile it just opened is a conversation about somebody who
// is no longer underneath it. What that costs is the trip back. The ← in the top
// bar of a profile goes home, because home is where it goes when nothing has
// told it otherwise — so the reader who stepped out of a conversation to find
// out who they were talking to lost the conversation to the question, and the
// remark they were halfway through answering with it.
//
// So the press leaves a note where it was standing. Not in the URL: which sheet
// a reader had open is a position and not an address — the same argument the
// dashboard's page number is kept out of the path by (see utils/pages.js). A
// comment column standing over the posts map is not a thing anybody links to,
// sends to somebody else, or should be able to land on cold from a bookmark. The
// note goes on the history entry instead, which is the browser's own place for
// exactly this: it belongs to that one entry rather than to the tab, it survives
// a reload of it, it is gone when the entry is, and coming back to the entry is
// what hands it over.
//
// Which makes the ← the browser's own step back rather than a trip to an
// address. The entry the reader is standing on is what says whether there is a
// step to take — nothing can see the entry behind it — and taking it is what the
// back gesture, the mouse's fourth button and the phone's own back button have
// been doing all along, so the button in the bar and the ones outside it now
// agree. It comes back to the scroll position too, which a fresh trip to the
// same address does not.

// Whatever the entry is already carrying. The router puts an empty object there
// to start with and more than one thing may want to write on it, so every write
// below goes over the top of what is there rather than in place of it.
function state() {
  try {
    return window.history.state ?? {};
  } catch {
    // Nothing readable: the ← falls back to the page it always fell back to
    return {};
  }
}

function write(next) {
  try {
    window.history.replaceState(next, "");
  } catch {
    // A browser that will not have its entries written on loses the way back and
    // nothing else — the note is the whole of what this module keeps.
  }
}

// Said by a name inside a sheet, on the press that closes it: what was open
// here, so that coming back to this entry can open it again.
//
// `sheet` is a plain description — which sheet, and what it was about — because
// it is handed to the browser to keep and comes back as a copy of itself rather
// than as the object that went in. What it means is the business of whoever
// answers for that kind (see reopening below).
export function leaving(sheet) {
  if (!sheet) return;
  write({ ...state(), sheet });
}

// Whether the reader arrived where they are by pressing a name in a sheet rather
// than by opening the address.
export function cameBack() {
  return Boolean(state().back);
}

// The ←: back a step where there is one behind, and to the page the caller names
// where there is not. A profile opened in a tab of its own has nothing behind it
// but the tab it was opened from, and a profile opened from a link somebody sent
// has nothing behind it at all.
export function stepBack(navigate, to) {
  if (cameBack()) {
    window.history.back();
    return;
  }
  navigate(to);
}

// What to open again, for whoever has just been landed back on. `kinds` is what
// the caller can open — the top bar answers for its own two sheets, the page
// under it for its own — so the one note on the entry goes to the one place that
// can act on it, and everybody else leaves it alone.
//
// Taken rather than read: the note belongs to the trip, and the trip ends here.
// A sheet the reader closes after it has been handed back is closed, and the
// entry is a page again.
export function reopening(kinds) {
  const { sheet, ...rest } = state();
  if (!sheet || !kinds.includes(sheet.kind)) return null;
  write(rest);
  return sheet;
}

// Spread onto the name inside a sheet, the way sheetLink is spread onto the row
// that opens a story (see ui/PageModal). What it adds to the press is the trip:
// the sheet is written down where it stands, the entry the name leads to is
// marked as one there is a step back from, and the sheet itself goes — which is
// what the press meant.
//
// A held modifier is asking for a tab and gets one: nothing is written down,
// nothing is closed, and the reader keeps the conversation they are in.
//
// Without a sheet to come back to the name is still a way through to the person,
// and the entry it leads to is left unmarked: a ← that stepped back to the very
// page it was already on would read as a button that does nothing.
export function nameLink(sheet, close) {
  return {
    state: sheet ? { back: true } : null,
    onClick: (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      leaving(sheet);
      close();
    },
  };
}
