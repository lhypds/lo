import { storedName } from "./image.js";

// The five ways off lo, in one list read from both ends: the sheet that fills
// them in and the profile that shows them. A field added to one and not the
// other would be a contact somebody could enter and nobody could reach.
//
// All five are shown wherever they are filled in. Which of them a person is
// *asked* for is a different question, and a narrower one — see contactsFor
// below: three of these are the same app under three names, and nobody needs to
// be asked for all three. `always` is the ones that are nobody's regional
// question: an address and a page of your own are the same two things in every
// language there is.
//
// `link` is for the handles that are an address in their own right — an email
// one, a page on the web, and a phone number written the way WhatsApp's own links
// need it. A LINE ID and a WeChat ID are neither: they are typed into that app by
// hand, so those rows are text to be read off and copied, which is all lo can
// honestly make of them.
export const CONTACTS = [
  {
    field: "email",
    label: "profile.email",
    // A hint to the phone keyboard, and nothing more: the address itself is
    // checked on the way into the database.
    type: "email",
    placeholder: "you@example.com",
    always: true,
    link: (value) => `mailto:${value}`,
  },
  {
    // Whatever somebody keeps of their own off lo: a site, a blog, a page at a
    // company. The one contact here that is a place rather than a way of reaching
    // a person, which is why it is the one that opens in a tab of its own —
    // everything else on this list hands the press to an app, and this hands it
    // to the web.
    field: "website",
    label: "profile.website",
    type: "url",
    placeholder: "example.com",
    always: true,
    external: true,
    // The server stores this with a scheme on the front and refuses anything but
    // http and https (see readProfile). Asked again here all the same: this is
    // the value that goes into an href, and a row written before that check
    // existed must not be the one that finds out.
    link: (value) => (/^https?:\/\//i.test(value) ? value : null),
  },
  {
    field: "line",
    label: "profile.line",
    type: "text",
    placeholder: "line-id",
  },
  {
    field: "whatsapp",
    label: "profile.whatsapp",
    type: "tel",
    placeholder: "+81 90 1234 5678",
    // wa.me takes an international number and nothing else, so only a number
    // written as one is turned into a link — a local number would open WhatsApp
    // on somebody else's line, which is worse than not being pressable.
    link: (value) =>
      value.startsWith("+") ? `https://wa.me/${value.replace(/[^\d]/g, "")}` : null,
  },
  {
    field: "wechat",
    label: "profile.wechat",
    type: "text",
    placeholder: "wechat-id",
  },
];

// Which messenger a language actually uses. Not a guess about a person — the
// interface language is the one thing lo knows about how somebody reads, and it
// is a good enough answer to "which of these three should I be asked for": a
// dashboard in Chinese asks for WeChat, one in Japanese for LINE, and the rest
// of the world for WhatsApp.
//
// The account is not tagged with this. It decides what the sheet asks for and
// nothing else, so switching the language switches the question rather than
// the answer.
const MESSENGERS = { zh: "wechat", ja: "line" };
const ELSEWHERE = "whatsapp";

export function messengerFor(language) {
  return MESSENGERS[String(language ?? "").split("-")[0]] ?? ELSEWHERE;
}

// What the sheet asks for: the address everybody has, the messenger this
// language uses — and anything already filled in whichever language it was
// filled in from. That last part is the whole reason this takes a profile: a
// contact somebody can see on their own page and cannot edit would be a trap
// rather than a shorter form, and switching language to reach a field is not an
// instruction anybody should have to work out.
export function contactsFor(language, filled = {}) {
  const messenger = messengerFor(language);
  return CONTACTS.filter(
    (contact) => contact.always || contact.field === messenger || Boolean(filled[contact.field]),
  );
}

// The profile as the API takes it: every field, whatever is in them. What is
// missing is sent as an empty string rather than left out, because an empty field
// means cleared — see readProfile on the server, which reads it the same way.
//
// All of them even when the sheet only asked for three: a WeChat ID entered in
// Chinese is still that account's WeChat ID when the same person comes back in
// English, and a form that sent only what it drew would take it down for them.
export function profileFields(source = {}) {
  const fields = { bio: source.bio ?? "" };
  for (const contact of CONTACTS) fields[contact.field] = source[contact.field] ?? "";
  // The two that are not a line of text. The picture is carried as the name it is
  // stored under, because that is what writing one takes: the profile hands it
  // over as the URL that serves it, and the last segment of that is the name.
  // The list of other accounts is its own array, copied rather than shared so
  // that editing a row is not editing the account the form was opened on.
  fields.avatar = storedName(source.avatar) ?? "";
  fields.links = Array.isArray(source.links)
    ? source.links.map((link) => ({ kind: link.kind, value: link.value }))
    : [];
  return fields;
}
