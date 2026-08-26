import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { formatUsername } from "../../utils/format.js";
import { isIOS } from "../../utils/device.js";
import Header from "../../components/Header/index.js";
import Messages from "../../components/Messages/index.js";
// The module rather than the barrel beside it: this only needs the way in, and
// the barrel would pull the profile sheet itself in behind it.
import { openProfile } from "../../components/UserModal/userApi.js";
import styles from "./messages.module.css";

// Past this much magnification the window is not a smaller window at all — it is
// the same one seen closer up, and nothing on this page should answer. A hair
// over 1 rather than 1 flat: a browser at rest does not always say 1.0000.
const ZOOMED = 1.01;
// How long after the last word from the browser the window is taken to have
// stopped moving. iOS says how big the window is while the keyboard is still
// sliding up and while its own toolbar is still sliding out, and the number it
// gives mid-slide is not the one it settles on — a page sized from that one
// stands the difference above the keys. Long enough to outlast the slide, short
// enough that nobody watches it happen.
const SETTLE_MS = 300;
// Below this much of the window gone, whatever took it was not a keyboard.
// Safari's own bottom bar sliding in or out is worth a few tens of pixels, and a
// keyboard's height remembered off one of those would shorten the page by a bar
// — which is the composer under the keys the next time somebody types.
const KEYBOARD_MIN = 120;
// Which phone this is does not change while the page is open, so it is asked
// once at import rather than on every paint. It decides how much room the
// composer keeps under it — see .curved in the stylesheet beside this.
const CURVED = isIOS();

// The phone's frame around a conversation: a page of its own, at /messages for
// the mailbox and /messages/<name> for one of the threads in it.
//
// A page rather than the sheet a desktop gets, because on a screen this size a
// sheet is the whole window — and a sheet is a thing with a page under it by
// definition, so on iOS the dashboard went on showing through its edges while
// somebody was answering a message. A page has nothing behind it to show. A
// conversation is also the one thing in lo that is stayed in rather than glanced
// at, which is what makes leaving the dashboard behind the right trade here and
// the wrong one on a desktop.
//
// The two frames share everything below the name — see components/Messages. What
// is here is the window's height, the way back, and the keyboard.
export default function MessagesPage({ username = null }) {
  const { t } = useTranslation();
  const pageRef = useRef(null);

  // The page is cut to the visual viewport — the part of the window that can
  // actually be seen — and moved to sit on it. That is the room above the keys
  // while somebody is typing and the room between a browser's own bars the rest
  // of the time. The composer stands on the floor of this page, so the floor has
  // to be an edge that is really there rather than the height the window is
  // willing to claim.
  //
  // Measured at rest as well, and not only under a keyboard, because dvh is not
  // settled on this page's first paint. iOS answers it with the window it would
  // have if its own bottom bar were away, hands the page that height, and does
  // not correct itself until something resizes — so the composer arrived a bar
  // too low, sunk into the curve of the screen, and then sprang to where it
  // belonged the first time a keyboard had been up and gone. The keyboard was
  // never what fixed it. The resize behind the keyboard was, and this is that
  // resize asked for on arrival instead of waited for.
  //
  // It is also still what an older phone needs for the keyboard itself. Where
  // the keys do not take their room out of the window — index.html asks for that
  // with interactive-widget=resizes-content, and not every browser knows it yet —
  // they slide up over the page instead, and the browser scrolls the visual
  // viewport down the window to keep the field in sight. A page fixed to the
  // window does not go with it: what is left on screen is a strip of the middle
  // of this one, the top bar gone off the top and paper where the keys should be.
  // Sitting the page on the visual viewport puts the bar back, puts the composer
  // on the keys, and leaves the browser nothing it still wants to scroll.
  //
  // Except while the reader is only looking closer. A pinch shrinks the visual
  // viewport exactly the way a keyboard does and means nothing of the sort, and
  // cutting the page to it then drags the page about under somebody who has done
  // no more than zoom in. Magnified, the page is handed back to the stylesheet
  // and its dvh. (The composer's own field is 16px on a touchscreen so that iOS
  // does not do the zooming itself — see .mark-field in styles.css — which is the
  // braces to this belt.)
  //
  // Nothing here touches the room under the composer. That the keys are up is
  // something the page can see for itself — the field has the focus — and the
  // gap the composer keeps over them is read off the document rather than off
  // any measurement: see :focus-within in the stylesheet beside this. The same
  // fact is read here too, and for the same reason, but only ever to know which
  // window to cut the page to; how far the composer then stands off the floor of
  // it stays the stylesheet's alone.
  //
  // Written as custom properties, so what is left when they are dropped is the
  // stylesheet's own answer rather than a number this had to remember.
  //
  // Before the paint rather than after it: this runs on the height the composer
  // is drawn at, and an effect that ran afterwards would draw it on the floor of
  // the wrong window first and move it in the next frame.
  //
  // And measured only when the window has stopped moving, never while it is
  // still on its way. Every number here is read off a window two things are
  // sliding in — the keyboard coming up, and Safari's own bottom bar coming out
  // from under it — and iOS narrates the whole slide, a fresh height and a fresh
  // offset on every frame of it. A page redrawn on each of those does not follow
  // the movement, it fights it: the browser has shifted what can be seen down
  // the window and the page is a step behind on its way after it, so the page
  // walks off the top of the screen and then comes back up from the bottom once
  // the talking stops. Which is the whole of the bug this is written against.
  //
  // So the page is cut to size on the news it can trust, and the movement itself
  // is sat out. The news is the tap: the caret landing in the field is the
  // keyboard coming up, and how much room the keys took the last time is how
  // much they will take this time. Cutting the page then — in the same frame as
  // the tap, before Safari has begun to slide anything — leaves a composer
  // already standing above where the keys are going to be, which is a field
  // Safari has no reason to scroll into sight. It scrolls nothing, the page is
  // never shifted, and the keys come up underneath a page that has not moved.
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const page = pageRef.current;
    if (!viewport || !page) return undefined;

    // The window with nothing over it, and what a keyboard takes out of it. The
    // first is what the page goes back to when the keys go; the second is what
    // lets it be cut at the tap rather than after the sliding is over. Both are
    // learned from the browser — how tall a keyboard is is the phone's business
    // and no number this page could know — and both are only ever this device's.
    let rest = viewport.height;
    let keys = 0;

    // Somebody is typing if the caret is in a field, which on a touchscreen is
    // the same fact as the keys being up. The same fact :focus-within reads for
    // the room under the composer — see the stylesheet beside this.
    const typing = () => page.querySelector("input:focus, textarea:focus") !== null;

    const cut = (height, top) => {
      page.style.setProperty("--view-height", `${height}px`);
      page.style.setProperty("--view-top", `${top}px`);
    };

    // What the browser says, taken as true — called on arrival, where nothing is
    // moving yet, and once the movement has stopped every time after that. It is
    // also where the two numbers above are learned: whatever the window is while
    // nobody is typing is the window at rest, and whatever it is short by while
    // somebody is is the keys.
    const settled = () => {
      if (viewport.scale > ZOOMED) {
        page.style.removeProperty("--view-height");
        page.style.removeProperty("--view-top");
        return;
      }
      if (typing()) {
        const taken = rest - viewport.height;
        if (taken > KEYBOARD_MIN) keys = taken;
      } else {
        rest = viewport.height;
      }
      cut(viewport.height, viewport.offsetTop);
    };

    let settle = 0;
    const after = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(settled, SETTLE_MS);
    };

    // The caret arriving in the field and leaving it, which is the keys coming
    // and going. Answered from what is already known rather than from anything
    // measured now — there is nothing to measure yet, the keyboard has not begun
    // to move — and confirmed against the browser once it has.
    const hand = () => {
      if (viewport.scale > ZOOMED) return;
      cut(typing() ? rest - keys : rest, 0);
      after();
    };

    // And the window moving of its own accord: a turn of the phone, a bar
    // sliding out, the arrival on this page — every one of which is a slide to be
    // let go by and answered at its end. Except the first tap of a visit, which
    // has no keyboard height to have gone on and so reaches here instead: a page
    // left alone through that one is a page Safari has scrolled half off the
    // top, and a guess taken mid-slide is worth more than the wait. It is also
    // the guess that teaches `keys`, so it happens once and no tap after it
    // comes through here again.
    const moved = () => {
      if (typing() && !keys) settled();
      after();
    };

    // The arrival is a slide of its own on iOS, where walking to this page hides
    // the browser's bottom bar: the page is drawn on the window it has now, and
    // asked again once that has finished going.
    settled();
    after();
    page.addEventListener("focusin", hand);
    page.addEventListener("focusout", hand);
    viewport.addEventListener("resize", moved);
    viewport.addEventListener("scroll", moved);
    return () => {
      window.clearTimeout(settle);
      page.removeEventListener("focusin", hand);
      page.removeEventListener("focusout", hand);
      viewport.removeEventListener("resize", moved);
      viewport.removeEventListener("scroll", moved);
    };
  }, []);

  return (
    // The top bar's arrow is the way out of both views, and it is the only one
    // either of them needs: out of a thread is the list of them, out of the list
    // is the dashboard.
    <div className="page-shell messages-page" ref={pageRef}>
      <Header back backTo={username ? "/messages" : "/"} />
      <main className={`${styles.main}${CURVED ? ` ${styles.curved}` : ""}`}>
        {/* Who you are talking to, or that this is the mailbox — what the sheet
            says in its own title bar and a page has to say for itself. No count
            beside it the way the two list pages carry one: those are lists of
            things, this is a list of people, and how many people you have ever
            spoken to is not a number anybody is keeping.

            The name is also the way through to whoever it belongs to, which is
            why the conversation under it has no button of its own for that: a
            name is the plainest thing to press to find out whose it is. It opens
            the profile over this page rather than walking to it — a glance aside
            in the middle of writing to somebody, who is this again, and closing
            it puts the thread and the half-written line back exactly as they
            were. */}
        <div className={`section-heading ${styles.heading}${username ? ` ${styles.ruled}` : ""}`}>
          <h1>
            {username ? (
              <button
                type="button"
                className={styles.name}
                onClick={() => openProfile(username)}
                title={t("messages.profile")}
              >
                {formatUsername(username)}
              </button>
            ) : (
              t("messages.title")
            )}
          </h1>
        </div>
        {/* Threads have addresses here, so their rows are links: one of them can
            be opened in a tab of its own like anything else with a URL. */}
        <Messages to={username} link={(name) => `/messages/${encodeURIComponent(name)}`} />
      </main>
    </div>
  );
}
