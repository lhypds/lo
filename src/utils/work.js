// What somebody does, as a list to pick from. Two of these are the ones anybody
// names when asked what such a field is for; the rest are the trades the people
// on a dashboard like this turn out to have. No list of jobs is complete and this
// one is not trying to be — what it is for is that the common answers are a press
// rather than a sentence somebody has to compose, and the box beside the menu is
// where every other answer goes (see OWN_WORK below, and the sheet that draws it).
//
// Slugs and nothing else, which is where this parts company with the table of
// platforms next door (see utils/links.js): a platform is a name and is written
// the same way in every language, and a trade is a common noun — photographer is
// 摄影师 to a reader in Chinese and 写真家 to one in Japanese, and lo speaks
// several languages. So the words live in the translations under work.<kind>, and what is
// kept here is only which of them there are and the order they are offered in.
//
// Loosely grouped rather than sorted: alphabetical is an order in one language
// and a shuffle in the others, so what this keeps instead is a
// grouping a reader can see down the menu — the ones who make pictures, the ones
// who build things, the ones who work at a subject, and the rest.
export const WORK_KINDS = [
  "photographer",
  "designer",
  "artist",
  "writer",
  "musician",
  "filmmaker",
  "developer",
  "engineer",
  "architect",
  "founder",
  "researcher",
  "teacher",
  "student",
  "doctor",
  "journalist",
  "chef",
];

const KNOWN = new Set(WORK_KINDS);

// The last row of the menu, and the one row on it that is not an answer: it is
// what the reader takes in order to write their own. Never stored — what an
// account holds is either one of the slugs above or whatever its owner typed, and
// which of the two it is can be read off the value itself (see isOwnWork).
export const OWN_WORK = "own";

// What to call it. A slug off the table is shown in the reader's own language;
// anything else is what its owner wrote, which is already in a language and is
// not lo's to translate — the same answer linkName gives a platform it has no
// name for, for a slightly different reason.
export function workName(work, t) {
  const value = String(work ?? "").trim();
  return KNOWN.has(value) ? t(`work.${value}`) : value;
}

// Whether what an account holds is a word of its owner's rather than one off the
// list, which is what the sheet needs in order to open with the box showing. An
// empty field is neither: it is nothing said, which is the row at the top of the
// menu.
export function isOwnWork(work) {
  const value = String(work ?? "").trim();
  return Boolean(value) && !KNOWN.has(value);
}
