// Which of a spot's names to put on the row, and what to fall back to when the
// one asked for is not there.
//
// A mark keeps its place name in each language lo is read in — `places`, keyed by
// language code, written when the mark was saved (see lookupPlaceLines on the
// server). Which of them a reader gets is a question about the reader and not
// about the spot: the same corner of Kyoto is 下京区 to one and Shimogyo Ward to
// another, and it was written down as one of the two only because of who
// happened to be holding the phone that afternoon.
//
// Then English, because it is the language lo assumes about anyone it has not
// been told about — the same assumption the server makes of a request with no
// lang on it. Then `place`, the plain string a mark has always had, which is the
// only name a spot from before this field has, and the only one a spot converted
// out of somebody else's export is likely to have either.
//
// And then, only when all three of those came up empty, whatever name the spot
// does have. That last step is unreachable through lo's own writing — the server
// writes `place` whenever it writes `places` — but a file assembled by hand or by
// somebody's AI can arrive knowing a spot in Japanese and in no other way, and
// showing "unnamed" over a name we are holding would be a poor reason to be
// tidy about the order.
//
// Nothing found is the empty string rather than null: every caller is choosing
// between this and a label the reader typed, and `||` is the whole of that
// choice.
export function placeName(mark, lang) {
  const places = mark?.places;
  return places?.[lang] || places?.en || mark?.place || Object.values(places ?? {})[0] || "";
}

// Every name the spot is known by, for the search box — which is a different
// question from what the row shows. Somebody typing "kyoto" should find the spot
// whose row reads 京都市, because the reader searching is the same person either
// way and the language they are reading in is not always the one they are
// thinking in.
export function placeNames(mark) {
  return [...new Set([...Object.values(mark?.places ?? {}), mark?.place].filter(Boolean))];
}
