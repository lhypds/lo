// What somebody does, as a list to pick from. Two of these are the ones anybody
// names when asked what such a field is for; the rest are the trades the people
// on a dashboard like this turn out to have. No list of jobs is complete and this
// one is not trying to be — the field itself is a box somebody writes in, and
// this is the shortcut past the writing for the answers that come up over and
// over. Everything else goes in the box (see the sheet, and isListedWork below).
//
// Slugs and nothing else, which is where this parts company with the table of
// platforms next door (see utils/links.js): a platform is a name and is written
// the same way in every language, and a trade is a common noun — photographer is
// 摄影师 to a reader in Chinese and 写真家 to one in Japanese, and lo speaks
// several languages. So the words live in the translations under work.<kind>,
// and what is kept here is only which of them there are and the order they are
// offered in.
//
// Chosen rather than sorted. Alphabetical is an order in one language and a
// shuffle in the others, and a menu has a top whether or not anybody meant it to
// — the rows a reader sees before scrolling are the ones the list is really
// offering. So the first eight are the answers lo expects most of, in the order
// its author put them in, and the rest follow. That is a statement about which
// trades this dashboard has people from and about nothing else; the ranking of
// jobs it might look like is not one the list is making, and the box at the
// bottom of the menu is what says so — anything not here is a row somebody
// writes for themselves.
export const WORK_KINDS = [
  "architect",
  "photographer",
  "developer",
  "writer",
  "filmmaker",
  "journalist",
  "musician",
  "student",
  "designer",
  "artist",
  "engineer",
  "founder",
  "researcher",
  "teacher",
  "doctor",
  "chef",
];

const KNOWN = new Set(WORK_KINDS);

// What to call it. A slug off the table is shown in the reader's own language;
// anything else is what its owner wrote, which is already in a language and is
// not lo's to translate — the same answer linkName gives a platform it has no
// name for, for a slightly different reason.
export function workName(work, t) {
  const value = String(work ?? "").trim();
  return KNOWN.has(value) ? t(`work.${value}`) : value;
}

// Whether what an account holds came off the list, which is the one question
// either reader of this field has to ask: the sheet asks it to know whether the
// menu or the box is holding the answer, and the profile asks it to know whether
// to translate the word or print it. Anything else — an empty field, or a word
// somebody wrote — is the box's.
export function isListedWork(work) {
  return KNOWN.has(String(work ?? "").trim());
}
