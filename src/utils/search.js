// Both lists are short — the marks one person kept, the posts within a few
// hundred metres of them — so a search over either is a pass through an array
// that is already in hand. Nothing is asked of the server, and the answer
// arrives on the keystroke rather than after it.

// Folded before it is compared, on both sides: NFKC so a full-width ｓｈｉｂｕｙａ
// typed on a Japanese keyboard finds the half-width one that was saved, and
// lower case so nobody has to remember how they capitalised a spot.
function fold(text) {
  return text.normalize("NFKC").toLowerCase();
}

// Every row is flattened to the words it actually shows and matched as one
// string: a query is a thing half-remembered about a spot, not a field name, and
// which line of the row it was on is not something the reader knows in advance.
//
// Substring rather than prefix, because Japanese and Chinese rows have no spaces
// to start a word at — and because "shibuya" should find "near Shibuya station"
// in English too.
//
// `author`, where a list has one, is the exception to reading every row as one
// string. A query that opens with an @ is asking after a person and not after
// words, so it is matched against the name alone: @sam is what Sam left, not
// every post that mentions them. The @ is a way of being precise rather than a
// requirement — "sam" still finds the same rows, along with anything that says
// sam in its own words, because the name is one of the fields as well.
export function filterBy(items, query, fields, author) {
  const trimmed = query.trim();
  if (!trimmed) return items;
  if (author && trimmed.startsWith("@")) {
    // A lone @ is somebody a keystroke into a name: still everyone, for now.
    const name = fold(trimmed.slice(1));
    if (!name) return items;
    return items.filter((item) => fold(author(item) || "").includes(name));
  }
  const needle = fold(trimmed);
  return items.filter((item) => fold(fields(item).filter(Boolean).join(" ")).includes(needle));
}
