// Where the dashboard breaks into pages.
//
// The grid is a module and every card covers a whole number of squares — one,
// two across, two by two, two by three (see utils/cards.js) — so where a page
// ends can be worked out from the cards themselves instead of measured off the
// screen after the fact. All the window contributes is the shape of the module:
// how many columns the grid has, and how many rows of it fit between the strip
// and the dots.
//
// The placement below is the browser's own, done ahead of it. A card takes the
// first place at or after the one before it that has room, and the scan never
// goes back for a hole an earlier card left behind — which is how CSS grid fills
// a row-flow grid, and why a single square followed by a panel leaves half a row
// standing empty rather than tucking the next square into it. Counting squares
// alone would read that page as one card short of full and let it run off the
// bottom of the window, which is the one thing a page that cannot scroll must
// not do.
//
// The two-column mobile grid and four-column web grid use the same row-flow
// placement, so this simulation applies to both layouts.

// Whether a w×h block starting at (row, col) is standing on free ground. Rows
// past the end of what has been filled are empty by definition — the grid grows
// downwards as far as it is asked to.
function isFree(filled, row, col, w, h) {
  for (let r = row; r < row + h; r += 1) {
    const line = filled[r];
    if (!line) continue;
    for (let c = col; c < col + w; c += 1) {
      if (line[c]) return false;
    }
  }
  return true;
}

function occupy(filled, row, col, w, h, cols) {
  for (let r = row; r < row + h; r += 1) {
    if (!filled[r]) filled[r] = new Array(cols).fill(false);
    for (let c = col; c < col + w; c += 1) filled[r][c] = true;
  }
}

// The first place at or after the cursor that will hold the card. It always
// finds one: the grid has no bottom, so the search runs into empty rows.
function firstFit(filled, cursor, w, h, cols) {
  let { row, col } = cursor;
  for (; ;) {
    if (col + w > cols) {
      row += 1;
      col = 0;
    } else if (isFree(filled, row, col, w, h)) {
      return { row, col };
    } else {
      col += 1;
    }
  }
}

// `cards` in the order the page writes them, each carrying the `cols` and `rows`
// of the module it covers. Out comes the same list cut into pages, in the same
// order — paging is where the dashboard is broken, never how it is sorted.
//
// A card too tall for the page it is on is kept anyway rather than sent to a
// page of its own that would not hold it either: the window is shorter than the
// card's own minimum module in that case, and repeatedly moving the same card
// cannot make it fit. The row count follows however many complete modules fit
// in the dashboard window, while three is the tallest card the layout offers.
export function paginate(cards, cols, rows) {
  const pages = [];
  let page = [];
  let filled = [];
  let cursor = { row: 0, col: 0 };

  for (const card of cards) {
    const w = Math.min(card.cols, cols);
    const h = card.rows;
    let at = firstFit(filled, cursor, w, h, cols);
    if (at.row + h > rows && page.length > 0) {
      pages.push(page);
      page = [];
      filled = [];
      cursor = { row: 0, col: 0 };
      at = firstFit(filled, cursor, w, h, cols);
    }
    occupy(filled, at.row, at.col, w, h, cols);
    cursor = { row: at.row, col: at.col + w };
    page.push(card);
  }

  // Always one page, even carrying nothing: the empty grid is what the window is
  // measured against before there is anything on it.
  pages.push(page);
  return pages;
}
