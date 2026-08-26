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
// What the keys are taken to be worth on a screen that has never had them up
// before. A share of the window rather than a count of pixels, since the first
// tap has to be answered on a phone of unknown size — and read high on purpose.
// A page shortened by more than the keys turn out to need leaves the field
// standing clear of them, which is a field iOS has no reason to move the window
// for; the true figure lands a moment later and the composer settles down onto
// the keys. Shortened by less and the field is under them, which is the one
// thing that takes the top bar off the top of the screen. Landscape keys take a
// larger share of a smaller window.
const KEYBOARD_GUESS_TALL = 0.45;
const KEYBOARD_GUESS_WIDE = 0.6;
// And where the true figure is kept between visits, so the guess above is only
// ever wanted on the very first tap this phone has made in lo. Keyed by the
// screen and the way up it is held: a turned phone is a different keyboard.
const KEYS_STORE = "lo:keys";
// Which phone this is does not change while the page is open, so it is asked
// once at import rather than on every paint. It decides how much room the
// composer keeps under it — see .curved in the stylesheet beside this.
const CURVED = isIOS();

// Which way up the phone is held, which is the only part of the screen's own
// description that changes while lo is open — iOS reports the glass in its
// natural orientation whichever way it is turned.
function held() {
  return window.innerWidth > window.innerHeight ? "wide" : "tall";
}

function keysKey() {
  return `${KEYS_STORE}:${window.screen.width}x${window.screen.height}:${held()}`;
}

// The keyboard's height as last learned on this screen, or null where it has
// never been learned — which is a different answer from nothing at all, since a
// screen with no on-screen keyboard on it (an iPad with a keyboard of its own
// attached) learns a nothing worth keeping.
function keysKept() {
  try {
    const kept = window.localStorage.getItem(keysKey());
    if (kept === null) return null;
    const height = Number(kept);
    return Number.isFinite(height) && height >= 0 ? height : null;
  } catch {
    return null;
  }
}

function keepKeys(height) {
  try {
    window.localStorage.setItem(keysKey(), String(Math.round(height)));
  } catch {
    // A phone that will not keep the figure is a phone that guesses on its first
    // tap of every visit, which is the behaviour above rather than a fault.
  }
}

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
  // And read every frame for as long as anything is moving, rather than on the
  // browser's word that it has. The two halves of the answer want opposite
  // things, and treating them as one number is what kept the top bar sliding off
  // the screen and arriving late:
  //
  // Where the page sits — the offset — has to be exact this frame or not at all.
  // Focusing the field is iOS moving the part of the window that can be seen
  // down the window itself, to keep the field clear of the keys, and a page fixed
  // to the window does not go with it: the bar goes off the top, and the page
  // looks pushed up from the bottom of the screen. Following it is the whole job,
  // and iOS does not say enough to follow it by — it fires a resize and a scroll
  // or two across a slide a good fifteen frames long, so a page that waits to be
  // told stands still through the movement and lands in place after it. Which is
  // the bar arriving where it belongs a moment late, and is the bug. The viewport
  // is a thing that can be read at any time, so it is read on every frame the
  // movement lasts and the page is never behind it by more than one.
  //
  // How tall the page is wants the opposite: a height taken mid-slide is short by
  // whatever has not finished arriving, and a page redrawn from each of those is
  // a thread that reflows fifteen times over. So while somebody is typing the
  // height is not measured at all — it is the room the keys left the last time
  // they were up, which is the room they will leave this time. That also means
  // the page is already short in the same frame as the tap, before iOS has begun
  // to slide anything, so the composer is standing above where the keys are going
  // to be while they are still on their way. A field already clear of them is a
  // field iOS has no reason to move the window for — so on the taps after the
  // first there is nothing to follow, and the page simply does not move.
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const page = pageRef.current;
    if (!viewport || !page) return undefined;

    // The window with nothing over it, and what a keyboard takes out of it. The
    // second is learned from the browser rather than assumed — how tall a
    // keyboard is is the phone's business and no number this page could know —
    // and it comes back from the last visit already known, which is what leaves
    // even the first tap of this one prepared for. null until it has been learned
    // anywhere, and 0 where it has been learned to be nothing.
    let rest = viewport.height;
    let keys = keysKept();
    // Which screen the figure above belongs to, so that turning the phone goes
    // and fetches the one for the way it is now held rather than typing under the
    // other one's keyboard. Only when it has actually changed: a phone that will
    // not keep the figure at all answers null every time it is asked, and asking
    // it after every keystroke would be guessing afresh on every tap.
    let kept = keysKey();
    // What is on the page now, so a frame that would change nothing writes
    // nothing: on every tap after the first the height does not move at all, and
    // this is what keeps a per-frame read from reflowing the thread anyway.
    let drawnHeight = null;
    let drawnTop = null;

    // Somebody is typing if the caret is in a field, which on a touchscreen is
    // the same fact as the keys being up. The same fact :focus-within reads for
    // the room under the composer — see the stylesheet beside this.
    const typing = () => page.querySelector("input:focus, textarea:focus") !== null;

    // How tall the page should be this frame. Measured whenever there is nothing
    // over the window — that is the browser's own business and it is right about
    // it, on arrival and while the keys are going back down alike. Known rather
    // than measured while somebody is typing, for the reasons above, and guessed
    // where it has never been known; and the smaller of the two rather than the
    // known figure flat, so that a keyboard which has come back taller than last
    // time — a predictive strip, a switch to emoji — is under the composer rather
    // than over it while it waits to be relearned.
    const tall = () => {
      if (!typing()) return viewport.height;
      const guess = held() === "wide" ? KEYBOARD_GUESS_WIDE : KEYBOARD_GUESS_TALL;
      const room = keys === null ? rest * guess : keys;
      if (!room) return viewport.height;
      return Math.min(rest - room, viewport.height);
    };

    const draw = () => {
      // Magnified, the page is handed back to the stylesheet and its dvh.
      if (viewport.scale > ZOOMED) {
        page.style.removeProperty("--view-height");
        page.style.removeProperty("--view-top");
        drawnHeight = null;
        drawnTop = null;
        return;
      }
      const height = tall();
      const top = viewport.offsetTop;
      if (height !== drawnHeight) {
        page.style.setProperty("--view-height", `${height}px`);
        drawnHeight = height;
      }
      if (top !== drawnTop) {
        page.style.setProperty("--view-top", `${top}px`);
        drawnTop = top;
      }
    };

    // The frames, for as long as the window is moving and a little past it. The
    // loop is what follows the offset; the timeout is what decides the movement
    // is over, and is pushed back by every further word from the browser.
    let frame = 0;
    let settle = 0;

    const step = () => {
      draw();
      frame = window.requestAnimationFrame(step);
    };

    // Where the two numbers are learned, once there is nothing still arriving to
    // learn them wrong: whatever the window is while nobody is typing is the
    // window at rest, and whatever it is short by while somebody is is the keys.
    const stop = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (viewport.scale <= ZOOMED) {
        if (typing()) {
          // Anything under a keyboard's worth was some other thing moving, and on
          // a screen whose keys are not on the glass at all there is nothing to
          // take — which is worth learning as the nothing it is, so that the guess
          // is not made again on a phone that has a keyboard of its own attached.
          const taken = rest - viewport.height;
          const learnt = taken > KEYBOARD_MIN ? taken : 0;
          if (learnt !== keys) {
            keys = learnt;
            keepKeys(learnt);
          }
        } else {
          rest = viewport.height;
          const key = keysKey();
          if (key !== kept) {
            kept = key;
            keys = keysKept();
          }
        }
      }
      draw();
    };

    const moving = () => {
      if (!frame) frame = window.requestAnimationFrame(step);
      window.clearTimeout(settle);
      settle = window.setTimeout(stop, SETTLE_MS);
    };

    // The caret arriving in the field and leaving it, which is the keys coming and
    // going. Drawn from what is already known before the browser has said a word
    // — that is the whole of the head start — and then followed.
    const hand = () => {
      draw();
      moving();
    };

    // The arrival is a slide of its own on iOS, where walking to this page hides
    // the browser's bottom bar: the page is drawn on the window it has now, and
    // followed until that has finished going.
    draw();
    moving();
    page.addEventListener("focusin", hand);
    page.addEventListener("focusout", hand);
    viewport.addEventListener("resize", moving);
    viewport.addEventListener("scroll", moving);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      page.removeEventListener("focusin", hand);
      page.removeEventListener("focusout", hand);
      viewport.removeEventListener("resize", moving);
      viewport.removeEventListener("scroll", moving);
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
