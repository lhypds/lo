import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { formatUsername } from "../../utils/format.js";
import Header from "../../components/Header/index.js";
import Messages from "../../components/Messages/index.js";
import styles from "./messages.module.css";

// Below this much of the window missing, whatever has taken the space is the
// keyboard rather than a browser's own chrome sliding in or out.
const KEYBOARD_MIN = 120;

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

  // A phone's keyboard does not take its room out of the window: on iOS it
  // slides up over the page, `innerHeight` never moves, and the browser scrolls
  // what it calls the visual viewport to keep the focused field in sight. This
  // page is the window's own height with a composer on its floor, so what that
  // scroll carries off the top of the screen is the top bar — the way back and
  // everything else up there — while the floor the composer sits on is somewhere
  // under the keys.
  //
  // So while the keyboard is up the page is measured against that visual
  // viewport rather than the window: as tall as the part of the screen that can
  // actually be seen, and moved down to wherever the browser has scrolled that
  // part to. The bar stays at the top of it, the composer sits on the keyboard,
  // and the browser has nothing left to scroll out of the way. Written as custom
  // properties so the page's own rules keep the plain window height whenever
  // there is no keyboard — and dropped again the moment it goes, rather than
  // tracked all the time, so a tab nobody is typing in is laid out by CSS alone.
  //
  // The home bar's inset goes with them: it is there to keep the composer off a
  // bar that the keyboard is now covering, and left in it would read as a gap
  // between the two.
  useEffect(() => {
    const viewport = window.visualViewport;
    const page = pageRef.current;
    if (!viewport || !page) return undefined;
    const sync = () => {
      if (window.innerHeight - viewport.height <= KEYBOARD_MIN) {
        page.style.removeProperty("--view-height");
        page.style.removeProperty("--view-top");
        page.style.removeProperty("--view-foot");
        return;
      }
      page.style.setProperty("--view-height", `${viewport.height}px`);
      page.style.setProperty("--view-top", `${viewport.offsetTop}px`);
      page.style.setProperty("--view-foot", "0px");
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
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
            spoken to is not a number anybody is keeping. */}
        <div className={`section-heading ${styles.heading}`}>
          <h1>{username ? formatUsername(username) : t("messages.title")}</h1>
        </div>
        {/* Threads have addresses here, so their rows are links: one of them can
            be opened in a tab of its own like anything else with a URL. */}
        <Messages to={username} link={(name) => `/messages/${encodeURIComponent(name)}`} />
      </main>
    </div>
  );
}
