// Everywhere else somebody keeps an account. The four contacts above this in the
// sheet are the ways to reach a person off lo and are asked for by name (see
// contacts.js); this is the open end of the same question — a list of platforms
// to pick from and a handle to go with it, as many rows as somebody wants.
//
// Adding one is a line in this table and nothing else. There is no matching list
// on the server: it keeps whatever kind it is handed as long as it is a slug (see
// readLinks in server/index.js), so a platform added here works the moment the
// page reloads, and a row saved under a kind this table no longer has is shown
// under its own slug rather than dropped — the reader put it there, and lo
// forgetting the name of a site is no reason to lose the handle.
//
// `at` is the front of a profile address on the platforms that have one, and the
// whole reason a row can be pressed: a handle is what somebody knows about their
// own account, and an address is what a reader needs. The ones with none of it
// are either an ID typed into an app by hand — WeChat, LINE — or a site whose
// profile URLs are not built out of anything a person would recognise as their
// name, which is most of the Chinese ones. Those rows are text to read off, and
// a link all the same the moment somebody pastes one in.
//
// The names are not translated. Every one of them is what the platform calls
// itself, in the script it calls itself in — a Japanese reader looking for 小红书
// on somebody's profile is looking for those three characters, and "RED" would be
// lo renaming somebody else's app.
export const LINK_KINDS = [
  { kind: "x", name: "X", at: "https://x.com/" },
  { kind: "xiaohongshu", name: "小红书" },
  { kind: "wechat", name: "微信" },
  { kind: "line", name: "LINE" },
  { kind: "whatsapp", name: "WhatsApp" },
  { kind: "instagram", name: "Instagram", at: "https://instagram.com/" },
  { kind: "threads", name: "Threads", at: "https://threads.net/@" },
  { kind: "tiktok", name: "TikTok", at: "https://tiktok.com/@" },
  { kind: "douyin", name: "抖音" },
  { kind: "weibo", name: "微博" },
  { kind: "bilibili", name: "Bilibili" },
  { kind: "youtube", name: "YouTube", at: "https://youtube.com/@" },
  { kind: "github", name: "GitHub", at: "https://github.com/" },
  { kind: "telegram", name: "Telegram", at: "https://t.me/" },
  { kind: "mastodon", name: "Mastodon" },
  { kind: "linkedin", name: "LinkedIn", at: "https://linkedin.com/in/" },
];

const BY_KIND = new Map(LINK_KINDS.map((entry) => [entry.kind, entry]));

// What to call a row. A kind this table has never seen is shown as the slug it
// was saved under — the same answer the warnings card gives a hazard it has no
// word for: what arrived is worth more to the reader than a blank.
export function linkName(kind) {
  return BY_KIND.get(kind)?.name ?? kind;
}

// Whatever the reader typed, as an address to press — or nothing, where it is a
// handle in an app no link can open.
//
// A pasted URL wins over the platform's own front, which is what makes every row
// on the list pressable if its owner wants it to be: somebody who has the address
// of their own page can put the address in. http and https only, because this
// goes into an href and an href runs whatever scheme it is given.
export function linkHref(kind, value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  // Anything else with a scheme on it is not a link lo will make — mailto is a
  // field of its own upstairs, and the rest are somebody trying it on.
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return null;
  const at = BY_KIND.get(kind)?.at;
  if (!at) return null;
  // A handle is written with an @ in front of it about as often as not, and the
  // front of the address already has one where the platform wants one.
  return `${at}${encodeURIComponent(text.replace(/^@+/, ""))}`;
}

// The rows as a profile shows them: named, addressed where there is an address,
// and only the ones with something in them. Anything not shaped like a row is
// dropped rather than drawn — this comes back from the server as a document, and
// a document is a thing to be read defensively.
export function profileLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .filter((link) => link && typeof link.kind === "string" && String(link.value ?? "").trim())
    .map((link) => ({
      kind: link.kind,
      name: linkName(link.kind),
      value: String(link.value).trim(),
      href: linkHref(link.kind, link.value),
    }));
}
