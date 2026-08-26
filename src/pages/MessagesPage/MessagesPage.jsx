import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { formatUsername } from "../../utils/format.js";
import Header from "../../components/Header/index.js";
import Messages from "../../components/Messages/index.js";
// The module rather than the barrel beside it: this only needs the way in, and
// the barrel would pull the profile sheet itself in behind it.
import { openProfile } from "../../components/UserModal/userApi.js";
import styles from "./messages.module.css";

// Below this much of the window missing, whatever has taken the space is the
// keyboard rather than a browser's own chrome sliding in or out.
const KEYBOARD_MIN = 120;
// And past this much magnification the window is not missing anything at all —
// it is the same window seen closer up, and nothing on this page should answer.
// A hair over 1 rather than 1 flat: a browser at rest does not always say 1.0000.
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

  // An older phone's keyboard does not take its room out of the window: it
  // slides up over the page, `innerHeight` never moves, and the browser is left
  // to scroll the focused field into sight itself — it scrolls what it calls the
  // visual viewport, the part of the window that can actually be seen, down the
  // window to where the field is. A page fixed to that window does not move with
  // it: what is left on screen is a strip of the middle of this page, the top bar
  // gone off the top and paper below the composer where the keyboard should be.
  //
  // index.html asks for the modern behaviour instead — interactive-widget=
  // resizes-content, where the window simply becomes the room above the keys and
  // nothing is scrolled anywhere. This is for the browsers that do not know that
  // yet: the page is measured against the visual viewport and moved to sit on
  // it, which puts the bar back at the top, the composer on the keys, and leaves
  // the browser nothing it still wants to scroll.
  //
  // Only where the window is being covered rather than merely magnified. A field
  // whose type iOS thinks too small to read is answered by zooming the page into
  // it, which shrinks the visual viewport the same way a keyboard does and means
  // nothing of the sort — measuring against it then drags the page around under
  // a reader who has only pinched at it. (The composer's own field is 16px on a
  // touchscreen for that reason — see .mark-field in styles.css — which is the
  // size iOS stops doing it at. This is the belt to that pair of braces.)
  //
  // Nothing here touches the room under the composer. Whether the keys are up is
  // something the page can see for itself — the field has the focus — and CSS
  // reads that off the document rather than off a measurement: see :focus-within
  // in the stylesheet beside this.
  //
  // Written as custom properties so the page's own rules keep the plain window
  // height whenever there is no keyboard, and dropped again the moment it goes.
  //
  // And asked again once the movement stops. Every answer here is measured off a
  // window two things are still moving in — the keyboard sliding up, and Safari's
  // own bottom bar sliding out from under it — and an answer taken mid-slide
  // leaves the page short by whatever had not finished moving, which is a band of
  // empty paper between the composer and the keys. The last word the browser says
  // is not always the true one, so the true one is asked for after the talking
  // has stopped.
  useEffect(() => {
    const viewport = window.visualViewport;
    const page = pageRef.current;
    if (!viewport || !page) return undefined;
    const sync = () => {
      const covered = window.innerHeight - viewport.height > KEYBOARD_MIN;
      if (!covered || viewport.scale > ZOOMED) {
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
    sync();
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
