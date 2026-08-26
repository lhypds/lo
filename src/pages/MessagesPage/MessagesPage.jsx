import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { formatUsername } from "../../utils/format.js";
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
  // Nothing here touches the room under the composer. Whether the keys are up is
  // something the page can see for itself — the field has the focus — and CSS
  // reads that off the document rather than off a measurement: see :focus-within
  // in the stylesheet beside this.
  //
  // Written as custom properties, so what is left when they are dropped is the
  // stylesheet's own answer rather than a number this had to remember.
  //
  // Before the paint rather than after it: this runs on the height the composer
  // is drawn at, and an effect that ran afterwards would draw it on the floor of
  // the wrong window first and move it in the next frame.
  //
  // And asked again once the movement stops. Every answer here is measured off a
  // window two things are still moving in — the keyboard sliding up, and Safari's
  // own bottom bar sliding out from under it — and an answer taken mid-slide
  // leaves the page short by whatever had not finished moving, which is a band of
  // empty paper between the composer and the keys. The last word the browser says
  // is not always the true one, so the true one is asked for after the talking
  // has stopped.
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const page = pageRef.current;
    if (!viewport || !page) return undefined;
    const sync = () => {
      if (viewport.scale > ZOOMED) {
        page.style.removeProperty("--view-height");
        page.style.removeProperty("--view-top");
        return;
      }
      page.style.setProperty("--view-height", `${viewport.height}px`);
      page.style.setProperty("--view-top", `${viewport.offsetTop}px`);
    };
    let settle = 0;
    const answer = () => {
      sync();
      window.clearTimeout(settle);
      settle = window.setTimeout(sync, SETTLE_MS);
    };
    // The arrival is a slide of its own on iOS, where walking to this page hides
    // the browser's bottom bar: the first measurement is taken while that is
    // still on its way out, so it gets the settle the resizes get.
    answer();
    viewport.addEventListener("resize", answer);
    viewport.addEventListener("scroll", answer);
    return () => {
      window.clearTimeout(settle);
      viewport.removeEventListener("resize", answer);
      viewport.removeEventListener("scroll", answer);
    };
  }, []);

  return (
    // The top bar's arrow is the way out of both views, and it is the only one
    // either of them needs: out of a thread is the list of them, out of the list
    // is the dashboard.
    <div className="page-shell messages-page" ref={pageRef}>
      <Header back backTo={username ? "/messages" : "/"} />
      <main className={styles.main}>
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
