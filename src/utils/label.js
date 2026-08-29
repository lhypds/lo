// Which of a mark's names to put on the row, and what to fall back to when the
// one asked for is not there.
//
// A mark keeps its name in each language somebody has named it in — `label`,
// keyed by language code, and holding only the languages there is a name in —
// because the reader who named it was reading in one of the six at the time and
// wrote in that one (see readLabel in server/users.js).
// The reader looking at it now may be reading in another, and the name written
// that afternoon is still the only name the spot has: a corner of Kyoto called
// 我家 by somebody reading in Chinese should not go back to being a pair of
// coordinates because the switcher in the top bar has since been moved to 日本語.
//
// So: the language being read in, and then English, because it is the language lo
// assumes about anyone it has not been told about — the same assumption the
// server makes of a request with no lang on it. Then Chinese, Japanese, French,
// Spanish and German,
// in the order the languages have everywhere else in lo, which is no more
// principled than that and does not need to be: past the reader's own language
// and lo's default, what is left is "some name rather than none", and any fixed
// order answers that.
//
// Nothing found is the empty string rather than null: every caller is choosing
// between this and — where a spot has no name at all, which is every spot kept in
// one tap and never named — the coordinates. `||` is the whole of that choice,
// and the coordinates are the end of it because they are the one thing every mark
// has and the plain truth about a spot nobody named.
export function labelName(mark, lang) {
  const label = mark?.label;
  return (
    label?.[lang] || label?.en || label?.zh || label?.ja || label?.fr || label?.es || label?.de || ""
  );
}

// Every name the spot is known by, for the search box — which is a different
// question from what the row shows. Somebody typing "kyoto" should find the spot
// whose row reads 京都駅, because the reader searching is the same person either
// way and the language they are thinking in is not always the one they are
// reading in.
export function labelNames(mark) {
  return [...new Set(Object.values(mark?.label ?? {}).filter(Boolean))];
}
