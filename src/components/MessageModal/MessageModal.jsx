import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Link, Modal, Skeleton, TextArea } from "../../ui/index.js";
import { nameLink } from "../../utils/back.js";
import { formatUsername, relativeTime } from "../../utils/format.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./message.module.css";

// The same figure the server holds a message to, so the count under the box runs
// out at the moment the send would be refused rather than after it.
const BODY_MAX = 1000;

// How often an open thread asks the server what has been said. Faster than
// anything else in lo turns — the presence loop is a minute, the fix half of that
// — because a conversation is the one thing here that two people are doing at
// once: a reply that took a minute to appear would be answered by somebody who
// had given up on it, and the mark on the far side would be a minute late saying
// their line had landed in front of anybody.
const THREAD_REFRESH_MS = 5000;

// How near the foot of the thread counts as being at it. A reader who has scrolled
// up into the exchange is left where they are when the loop brings a line; a reader
// at the end is carried along with it, which is what being at the end means.
const AT_END = 24;

// Whether two readings of the thread say the same thing: the same lines in the
// same order, each as read as it was. Compared rather than swapped in, because a
// turn of the loop that brought no news should be no news on the screen either —
// nothing re-rendered, and above all nothing scrolled.
function same(a, b) {
  return a.length === b.length && a.every((line, index) => line.id === b[index].id && line.read === b[index].read);
}

// One exchange with one person, over whatever page the reader was on: what has
// been said either way, and a box at the foot of it to say the next thing.
//
// A conversation rather than a letter, and the two are not the same sheet. A
// letter opened on its own would be a line of somebody's writing with no idea
// what it was answering — the whole of what "reply" means here is *to this*, and
// the exchange above the box is what says which this. It is also why one press
// on a name in the inbox is enough: the thread is the mail and the reply box in
// one reading, so there is nothing to open afterwards.
//
// `username` is the whole of what says the sheet is up: there is no state where
// this is open and about nobody. Two things mount it — a row in the inbox, and
// the button on somebody's profile — and both of them have a name in hand or
// they would not be pressing anything.
//
// `back` is how whoever mounted it would open it again: the note a name pressed
// in here leaves behind, so that the ← on the profile it leads to comes back to
// this exchange (see utils/back.js). Both mounters hand one over, since both can
// put the sheet back up — the inbox on the thread it was reading, a profile on
// the conversation its button starts.
export default function MessageModal({ username, back = null, onClose }) {
  const { t, i18n } = useTranslation();
  // Whose the lines on the right are. The server says which side each one hangs
  // on and never says a name for them — `mine` is the whole of what comes down —
  // so the only place your own name is to be had is the session.
  const { user } = useAuth();
  // Reading a thread is what marks it read, and the answer says how much is left
  // waiting — so the dot in the top bar goes out as the words arrive rather than
  // on the next turn of the presence loop.
  const { noteUnread } = useHere();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const threadRef = useRef(null);
  // Every reading of the thread gets a number, so a slow answer cannot land on
  // top of a newer one — the loop below asks again every few seconds, and the
  // sheet can be closed and reopened on somebody else in between.
  const askedRef = useRef(0);
  // One conversation read at a time. The ticket above decides which answer may
  // land; this decides how many connections may be waiting for one. Without it,
  // a WebView on a broken network opened another fetch every five seconds.
  const inFlightRef = useRef(null);
  // Whether the reader is at the end of the exchange, which is what says a line
  // arriving should carry them with it.
  const atEndRef = useRef(true);

  // One reading of the thread. `quiet` is a turn of the loop rather than the sheet
  // opening: it says nothing about waiting and nothing about failing, because the
  // thread already on screen is still the thread and a turn that missed is not
  // news to anybody.
  const load = useCallback(
    (quiet) => {
      if (!username) return Promise.resolve();
      const standing = inFlightRef.current;
      if (standing?.username === username) return standing.promise;
      standing?.controller.abort();

      const ticket = (askedRef.current += 1);
      const controller = new AbortController();
      if (!quiet) setLoading(true);
      const pending = api
        .getConversation(username, { signal: controller.signal })
        .then((data) => {
          if (ticket !== askedRef.current) return;
          const lines = data.messages ?? [];
          setMessages((current) => (same(current, lines) ? current : lines));
          noteUnread?.(data.unread ?? 0);
        })
        .catch((requestError) => {
          if (ticket === askedRef.current && !quiet) setError(requestError.message);
        })
        .finally(() => {
          if (inFlightRef.current?.promise === pending) inFlightRef.current = null;
          if (ticket === askedRef.current && !quiet) setLoading(false);
        });
      inFlightRef.current = { username, controller, promise: pending };
      return pending;
    },
    [username, noteUnread],
  );

  // Asked for when the sheet opens rather than with the page under it, the way
  // the follows lists are: most readings of a profile never write to anybody.
  //
  // Cleared on the way in, so a sheet opened on one person and then on another
  // never shows the first exchange under the second's name — and the half-typed
  // line goes with it, because a draft belongs to whoever it was being written
  // to. An answer still out when that happens belongs to the sheet that has gone:
  // bumping the ticket is what tells it so.
  useEffect(() => {
    if (!username) return undefined;
    setMessages([]);
    setDraft("");
    setError("");
    atEndRef.current = true;
    load();
    return () => {
      askedRef.current += 1;
      // Do not leave a read for a sheet that no longer exists on the wire, or
      // let a reopened sheet adopt an answer this cleanup made ineligible.
      if (inFlightRef.current?.username === username) {
        inFlightRef.current.controller.abort();
        inFlightRef.current = null;
      }
    };
  }, [username, load]);

  // And kept current while it is up. Both halves of a conversation need it: a line
  // the other side sends while this is open should arrive without the sheet being
  // closed and opened again, and a line of yours they have just read can only be
  // learned by asking — being read happens on their screen, not on this one.
  //
  // The same request does both, because the request *is* the reading: asking for a
  // conversation is what stamps the lines in it as seen (see /api/messages in
  // server/index.js). Which is also why the loop stops when the window is put
  // away: a thread left open in a tab nobody is looking at is not a thread being
  // read, and going on marking it would have this sheet telling the other side
  // something untrue on the reader's behalf.
  useEffect(() => {
    if (!username) return undefined;
    let timer = null;
    let stopped = false;

    function stop() {
      window.clearTimeout(timer);
      timer = null;
    }

    function schedule() {
      stop();
      if (stopped || document.hidden) return;
      timer = window.setTimeout(run, THREAD_REFRESH_MS);
    }

    async function run() {
      timer = null;
      if (stopped || document.hidden) return;
      await load(true);
      schedule();
    }

    function watch() {
      stop();
      if (document.hidden) {
        return;
      }
      // Coming back to it is a reading in itself, and the one moment the thread on
      // screen is most likely to be out of date.
      void run();
    }

    schedule();
    document.addEventListener("visibilitychange", watch);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", watch);
    };
  }, [username, load]);

  // The end of the thread, which is the part being had: a conversation opens on
  // its last line the way a page of one opens at the bottom, and a reply that
  // landed off screen would read as one that had not been sent.
  //
  // Only for a reader who is already there, now that lines arrive on their own: a
  // reader who has scrolled up into the exchange is reading it, and a loop that
  // dragged them back to the bottom every few seconds would be unusable.
  useEffect(() => {
    const box = threadRef.current;
    if (box && atEndRef.current) box.scrollTop = box.scrollHeight;
  }, [messages]);

  async function send(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const data = await api.sendMessage(username, body);
      // Straight onto the end of the thread rather than through a second read of
      // it: the writer is looking at the line they have just sent — and is taken
      // to it wherever in the exchange they had scrolled to, because sending is
      // asking to be at the end.
      atEndRef.current = true;
      setMessages((current) => [...current, data.message]);
      setDraft("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  // How far down your own side of the exchange the other person has got: the
  // newest line of yours they have had in front of them, and the only one the mark
  // is drawn on. One mark and not one per line, because that is what the fact is —
  // a thread is read down to a point, and saying it against every line above that
  // point is saying the same thing five times. Under the last of them it reads as
  // the boundary it is: everything above, seen; anything below, not yet.
  const readTo = messages.reduce((last, message) => (message.mine && message.read ? message.id : last), null);

  // The two names the sheet has to draw. The other side's is the sheet itself —
  // there is no state where this is open and about nobody — and your own comes
  // from the session, which is why it is the one that can be missing: a load that
  // could not reach the server draws its thread before the account comes back. A
  // line with no name over it is better than a bare "@".
  const me = user?.username ?? "";

  return (
    <Modal
      isOpen={Boolean(username)}
      // Whose exchange this is, and nothing else: the sheet is about one person,
      // and the word "messages" over a column of one person's writing would be
      // saying what is plain.
      title={username ? formatUsername(username) : ""}
      onClose={onClose}
      closeOnOverlay
      // The composer's own width, and for the composer's own reason: this is a
      // sheet worked in rather than read off, and at the narrow size a line of
      // somebody's writing is the half that gets cut.
      wide
    >
      <div className={styles.sheet}>
        {/* A definite height on the thread, so the box stands on the floor of the
            sheet and the exchange scrolls above it rather than pushing it off
            the bottom — and the same height however much has been said, so a
            sheet does not change size under the pointer that opened it. */}
        <div
          className={styles.thread}
          ref={threadRef}
          // Where the reader is in the exchange, read off every scroll rather than
          // held as state: what it decides is whether the next line arriving
          // carries them along, and that is a question asked in an effect and
          // answered in the same frame — nothing on screen depends on it.
          onScroll={(event) => {
            const box = event.currentTarget;
            atEndRef.current = box.scrollHeight - box.scrollTop - box.clientHeight <= AT_END;
          }}
        >
          {/* Waiting is not the same answer as none: "nothing said yet" while
              the request is still out would be a claim about two people rather
              than about the request. */}
          {messages.length === 0 ? (
            loading ? (
              <Skeleton rows={3} lines={1} label={t("common.loading")} />
            ) : (
              !error && <p className={styles.empty}>{t("messages.emptyThread", { name: formatUsername(username ?? "") })}</p>
            )
          ) : (
            <ul className={styles.lines}>
              {messages.map((message) => {
                const who = message.mine ? me : username;
                return (
                  <li key={message.id} className={message.mine ? `${styles.line} ${styles.mine}` : styles.line}>
                    {/* Who said it over the words and when they were said under
                        them, so a line carries the whole of what it is between
                        the two. The side it hangs on says it as well, and saying
                        it twice is the point: a sheet read at a glance is read by
                        the side, and one read closely has the name to read. */}
                    {who &&
                      (message.mine ? (
                        <span className={styles.who}>{formatUsername(who)}</span>
                      ) : (
                        // Through to the person, which is the one thing to do with
                        // somebody else's name here — the same hand-off the byline
                        // in a comment column makes, and to the same page. The sheet
                        // goes with the press: a thread left standing over the
                        // profile it just opened is an exchange about somebody who
                        // is no longer underneath it. A held modifier is asking for
                        // a tab, and leaves the conversation where it was.
                        //
                        // And the way back with it: the sheet writes itself down on
                        // the entry it is standing on, so the ← on the profile comes
                        // back to this exchange rather than to the dashboard — the
                        // reader stepped out of a conversation to see who they were
                        // talking to, not to leave it (see utils/back.js).
                        //
                        // Only their side. Your own name over your own lines is not
                        // a way anywhere — it is there to say which half of the
                        // exchange is yours.
                        <Link
                          to={`/${encodeURIComponent(who)}`}
                          className={styles.who}
                          {...nameLink(back, onClose)}
                        >
                          {formatUsername(who)}
                        </Link>
                      ))}
                    <span className={styles.bubble}>{message.body}</span>
                    {/* When it was said, and on the last line the far side has had
                        in front of them, that it has been. One small grey line
                        under the words either way: being read is a fact about a
                        message of the same size as when it was sent. */}
                    <span className={styles.meta}>
                      <time className={styles.when} dateTime={message.time}>
                        {relativeTime(message.time, i18n.language, t)}
                      </time>
                      {message.id === readTo && <span className={styles.read}>{t("messages.read")}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* The box, at the foot of what it is answering. A form rather than a
            button with a handler, so the sheet behaves the way every other thing
            in lo that takes typing does. */}
        <form className={styles.composer} onSubmit={send} autoComplete="off">
          <TextArea
            className={styles.text}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
            // Enter sends; Shift+Enter is a newline, and a return that only
            // closes an IME's candidate list (CJK input) is left to it.
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                send(event);
              }
            }}
            placeholder={t("messages.placeholder")}
            maxLength={BODY_MAX}
            rows={2}
            minHeight={64}
            disabled={sending}
          />
          <div className={styles.footer}>
            <span className={styles.count}>
              {draft.length}/{BODY_MAX}
            </span>
            {/* Nothing to send is not an error worth a line of red — the button
                is simply not pressable until there is something in the box. */}
            <button type="submit" className="primary-button" disabled={sending || !draft.trim()}>
              {sending ? t("messages.sending") : t("messages.send")}
            </button>
          </div>
        </form>

        {error && <p className="form-message error">{error}</p>}
      </div>
    </Modal>
  );
}
