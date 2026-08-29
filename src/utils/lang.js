import i18n from "../i18n/index.js";
import { tellHost } from "./host.js";
import { noteSetting, registerSetting } from "./settings.js";

// Which language lo is being read in, as a thing the reader has decided rather
// than as i18next's current state. The difference is the whole of what this file
// is for: not having picked one is an answer too — it means "whatever this device
// is set to" — and it is the answer the map reads to decide whether to label the
// ground in lo's language or in the machine's (see mapLanguage in MapCard).
//
// The key is bare `lang` rather than lo's usual `lo:` prefix because it was
// written before the others and readers are holding it; renaming it would put
// every one of them back to being guessed at.
const KEY = "lang";
export const LANGS = ["en", "zh", "ja", "fr", "es", "de"];

// The language the reader has chosen, or null where they have not chosen. Null and
// not the default: what lo is showing without a choice is the browser's own
// language where lo has that language, which is a guess, and a guess is worth
// telling apart from an answer.
export function pickedLang() {
  try {
    const stored = localStorage.getItem(KEY);
    return LANGS.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

// Everything a language changing means, in one place, because it means the same
// thing however it was changed — by the switcher in the top bar, or by this
// account's file arriving from another device.
//
// The host is told either way. It keeps a copy of this choice of its own — every
// feed it asks for is keyed on it, and the words on the display come from a list
// of its own — and it has no way of reading this one (see utils/host.js).
function apply(code) {
  if (!LANGS.includes(code) || code === pickedLang()) return false;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // The choice still holds for this visit when storage is unavailable.
  }
  i18n.changeLanguage(code);
  tellHost("setlang", { language: code });
  return true;
}

// The reader picking one, which is the only version of this that is written up
// for the account.
export function chooseLang(code) {
  if (apply(code)) noteSetting("lang", code);
}

registerSetting("lang", { read: pickedLang, adopt: apply });
