import { useCallback } from "react";
import { useNavigate } from "../../ui/index.js";
import { useHandheld } from "../../utils/device.js";

// Opening messages from wherever the reader happens to be standing: the envelope
// in the top bar, or "send a message" on somebody's profile. The same shape as
// the toast's own api, and for the same reason — the sheet is mounted once, in
// the top bar, and this is how anything on the page reaches it without a
// callback threaded through every component in between.
let _open = null;

// A username is the whole address, so it is read the way the server reads it.
function normalize(value) {
  return String(value ?? "").trim().normalize("NFKC").toLowerCase();
}

// With a name it opens on that thread, without one on the list.
export const openMessages = (username = null) => _open?.(normalize(username) || null);

export function register(openFn) {
  _open = openFn;
  return () => {
    _open = null;
  };
}

// Which of the two frames a press opens, decided in the one place: the sheet
// over the page on a desktop, the page of its own on a phone. Every way in goes
// through this, so the two never disagree — and because the answer is watched
// rather than read once, a window dragged across the line takes the next press
// to the other one.
export function useOpenMessages() {
  const navigate = useNavigate();
  const handheld = useHandheld();
  return useCallback(
    (username = null) => {
      const name = normalize(username);
      if (!handheld) {
        openMessages(name);
        return;
      }
      navigate(name ? `/messages/${encodeURIComponent(name)}` : "/messages");
    },
    [handheld, navigate],
  );
}
