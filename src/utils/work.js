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
// Sorted rather than chosen, and sorted where it is read rather than here. This
// list used to open with the eight answers lo expects most of, in the order its
// author put them in, on the reasoning that a menu has a top whether anybody
// means it to or not. It does — that is the trouble. Whatever such an order is
// meant to say about which trades this dashboard has people from, what a reader
// sees is a ranking of jobs with theirs somewhere down it, and no arrangement of
// this list is worth asking somebody to read past that. Alphabetical says
// nothing, which is the whole of why it is the right order: it is the one nobody
// has to be told the meaning of.
//
// So the menu is alphabetical in whatever language it is being read in, and it is
// the reader's own alphabetical — first letter where the language is written in
// letters, pinyin in Chinese, the kana reading in Japanese. That can only be done
// where the words are, which is not here; see workOptions in ProfileForm.
//
// Which leaves this holding only which trades there are, written down in slug
// order because a file has to write a list in some order and slug order is the
// one that means nothing either. No list of jobs is complete and this one is not
// trying to be — anything not on it is a row somebody writes for themselves.
export const WORK_KINDS = [
  "architect",
  "artist",
  "chef",
  "designer",
  "developer",
  "doctor",
  "engineer",
  "filmmaker",
  "founder",
  "journalist",
  "musician",
  "photographer",
  "researcher",
  "student",
  "teacher",
  "writer",
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
