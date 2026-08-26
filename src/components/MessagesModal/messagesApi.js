// Opening the messages sheet from wherever the reader happens to be standing:
// the envelope in the top bar, or "send a message" on somebody's profile. The
// same shape as the toast's own api, and for the same reason — the sheet is
// mounted once, in the top bar, and this is how anything on the page reaches it
// without a callback threaded through every component in between.
let _open = null;

// With a name the sheet opens on that thread, without one on the list.
export const openMessages = (username = null) => _open?.(username);

export function register(openFn) {
  _open = openFn;
  return () => {
    _open = null;
  };
}
