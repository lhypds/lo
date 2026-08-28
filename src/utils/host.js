// The little that lo has to say to whoever is hosting it. lo runs inside the Even
// Hub package as a cross-origin iframe (see lo-even/src/webui/webui.ts), and that
// frame holds a session of its own: a second token, minted at the same sign-in
// against the same account, which goes on feeding a pair of glasses. Two origins,
// two tokens, and no cookie between them — so nothing that happens in here reaches
// the other side by itself, and anything the glasses ought to follow has to be
// said out loud on its way past.
//
// Posted to any parent listening, because the host is an Even Hub WebView whose
// origin is not something lo could name in advance. That is only safe as long as
// there is nothing in a message to keep from a page that already has this one in a
// frame — no token, no key, no name — so keep it that way: what goes through here
// is news, not credentials.
//
// `detail` is whatever the notice carries beyond its name. The host takes the
// message apart by `type` and ignores every type it does not know (a phone running
// an older package is a phone that has to go on working), so a new notice is a new
// `type` rather than a new shape for an old one.
export function tellHost(type, detail = null) {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({ source: "lo", type, ...(detail || {}) }, "*");
  } catch {
    // A host that will not be posted to is a host that finds out for itself, the
    // next time it asks the server anything on the session it is holding.
  }
}
