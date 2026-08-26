import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Link } from "../../ui/index.js";
import { formatUsername, relativeTime } from "../../utils/format.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./messages.module.css";

// A thread on screen is the one thing in lo that somebody else can change while
// it is being read, so this is the one part of the app with a loop of its own.
// It is short on purpose — a message arriving a quarter of a minute late reads
// as a delay in the sender rather than in the app — and it stops dead while the
// tab is in the background, the way every other loop here does.
const MESSAGES_REFRESH_MS = 15 * 1000;
// The same ceiling the server keeps: the field stops taking characters at the
// point the request would have been refused.
const BODY_MAX = 1000;
// Within this much of the last line, the thread counts as standing on its floor
// — near enough that the reader is following the conversation rather than
// looking back through it.
const NEAR_BOTTOM = 80;

// Messages, in the two views a conversation needs: everyone you have traded a
// word with, and one of those in full.
//
// One component behind two frames — the sheet over the dashboard on a desktop,
// the page of its own on a phone — because they are the same conversation and a
// copy of it would drift. Same split UserProfile makes, for the same reason.
// What differs is only what is around it: which is why the name at the top, the
// way back, and the height all belong to whoever mounted this rather than to
// this. What is here is the conversation itself.
//
// The frame hands over a box that is a flex column with a height of its own —
// that is what puts the composer on the floor of it with the thread scrolling
// above — and says how a row is opened: `link` for a frame where a thread has an
// address, `onOpen` for one where it is a place inside the frame.
export default function Messages({ to = null, onOpen, link = null }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  // The dot on the envelope counts what is waiting, and reading a thread is what
  // clears it — so every answer below hands the new count back.
  const { noteUnread } = useHere();
  // Who there is to talk to, one row each. A list of people rather than of
  // messages: which direction a line went is a fact about that line, not a place
  // it lives, and filing them as sent and received would cut every conversation
  // in half and put the halves in different boxes.
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const requestRef = useRef(0);
  const atBottomRef = useRef(true);

  const load = useCallback(async () => {
    // Three things reach this — the frame opening, the loop, and a tab coming
    // back to the front — so a slower earlier answer must not land on a newer
    // one. Same ticket the location provider keeps, for the same reason.
    const ticket = ++requestRef.current;
    try {
      const data = to ? await api.getConversation(to) : await api.getThreads();
      if (ticket !== requestRef.current) return;
      if (to) setMessages(data.messages ?? []);
      else setThreads(data.threads ?? []);
      setError("");
      // Both answers carry the count, because asking for a thread is what reads
      // it: the dot on the envelope clears on the same round trip.
      noteUnread(data.unread ?? 0);
    } catch (requestError) {
      if (ticket !== requestRef.current) return;
      setError(requestError.message);
    }
  }, [to, noteUnread]);

  // The thread on screen belongs to the name held above it, so changing the name
  // empties it first: one person's words under another person's name is the one
  // thing this must never show, and a half-written line is addressed to whoever
  // was on screen when it was typed. The page frame walks from one conversation
  // to the next on a fresh mount and never needs this; the sheet keeps the same
  // one and does.
  useEffect(() => {
    setMessages([]);
    setBody("");
  }, [to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) load();
    };
    const timer = window.setInterval(tick, MESSAGES_REFRESH_MS);
    // Coming back to a backgrounded tab, the thread on screen is as old as the
    // time away — catching up is the first thing that should happen.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  // A thread is read from the bottom: the newest line is the one being answered,
  // and it is the composer's own neighbour.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages.length]);

  // Whether it is standing on that floor, kept current as the thread is
  // scrolled. Held as a flag rather than measured when it is needed, because by
  // then the room it would have been measured against is the one the keyboard
  // has just taken half of.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;
    const note = () => {
      atBottomRef.current =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_BOTTOM;
    };
    note();
    scroller.addEventListener("scroll", note, { passive: true });
    return () => scroller.removeEventListener("scroll", note);
  }, [to]);

  // A phone's keyboard coming up shortens the frame under the thread — the page
  // measures itself against the visual viewport for exactly that reason, see
  // pages/MessagesPage — and the lines it shortens away are the newest ones: the
  // half of the conversation somebody reaching for the field is in the middle
  // of. So the thread is put back on its floor as the room for it changes. Only
  // if it was already there: someone who has scrolled up to find something older
  // and then starts to type has not asked to be sent back to the end.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!to || !viewport) return undefined;
    const pin = () => {
      const scroller = scrollRef.current;
      if (scroller && atBottomRef.current) scroller.scrollTop = scroller.scrollHeight;
    };
    viewport.addEventListener("resize", pin);
    return () => viewport.removeEventListener("resize", pin);
  }, [to]);

  // Arriving from a profile, the composer is the whole reason this opened
  useEffect(() => {
    if (!to) return undefined;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [to]);

  async function send(event) {
    event.preventDefault();
    if (sending) return;
    const text = body.trim().normalize("NFKC");
    if (!text) return;
    setSending(true);
    setError("");
    try {
      const data = await api.sendMessage(to, text);
      // Straight onto the end of the thread rather than through a refetch: the
      // sender is looking at the line they have just written.
      setMessages((current) => [...current, data.message]);
      setBody("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
      // Sending a line is not finishing with the field: the answer to it is
      // usually the next thing typed. The press itself is kept off the field's
      // focus below, so on a phone this is only insurance — and it is a no-op
      // whenever the field never lost it, which is the case it is guarding.
      inputRef.current?.focus();
    }
  }

  if (to) {
    return (
      <>
        {/* Nothing above the lines but the lines. Whoever is being written to is
            named at the top of whichever frame this is in, and that name is the
            way through to them — a strip here saying so a second time was a row
            of chrome over every conversation to answer a question asked once. */}
        <div className={styles.scroll} ref={scrollRef}>
          {messages.length === 0 ? (
            <p className={styles.empty}>{t("messages.emptyThread", { name: formatUsername(to) })}</p>
          ) : (
            <ul className={styles.messages}>
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={
                    message.fromUser === user.username
                      ? `${styles.message} ${styles.mine}`
                      : styles.message
                  }
                >
                  <span className={styles.body}>{message.body}</span>
                  <time dateTime={message.time}>{relativeTime(message.time, i18n.language, t)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form className={styles.form} onSubmit={send} autoComplete="off">
          {/* The naming sheet's own row, at the scale a line of text is asked for
              in everywhere else — see .mark-field in styles.css. */}
          <div className="joined-field mark-field">
            <input
              ref={inputRef}
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                setError("");
              }}
              maxLength={BODY_MAX}
              enterKeyHint="send"
              autoComplete="off"
            />
            {/* The return key, drawn. What the word said, the key says without
                being read — and it is the key most of these lines will be sent
                with anyway. The word itself stays as the label a screen reader
                is given. */}
            <button
              type="submit"
              className="send-key"
              aria-label={sending ? t("messages.sending") : t("messages.send")}
              disabled={sending || !body.trim()}
              // Pressing this must not take the field's focus with it: on a
              // phone, focus leaving the field puts the keyboard away, and the
              // page then grows back to the whole screen under the thumb that
              // has just sent a line and is about to write another. Moving the
              // focus is what a press does by default, and refusing that is
              // what keeps it where it is — the press still lands, and the form
              // still submits, since that is the click's own business. Here
              // rather than on pointerdown: cancelling a press that early takes
              // the whole compatibility chain with it, and Safari has not always
              // agreed that the click is meant to survive it.
              onMouseDown={(event) => event.preventDefault()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 5v6a4 4 0 0 1-4 4H4" />
                <path d="m9 10-5 5 5 5" />
              </svg>
            </button>
          </div>
          {error && <p className="form-message error">{error}</p>}
        </form>
      </>
    );
  }

  // Who you talk to, and how each conversation was left. A row is a person and
  // pressing one opens what was said, which is the whole of it: there is nothing
  // here a name does not answer.
  //
  // A link where the frame has given threads an address and a button where it
  // has not — the row is the same row either way, and this is the one word of it
  // that is the frame's business.
  const Row = link ? Link : "button";
  const rowProps = (username) =>
    link ? { to: link(username) } : { type: "button", onClick: () => onOpen?.(username) };

  return (
    <>
      <div className={styles.threads}>
        {threads.length === 0 ? (
          <p className={styles.empty}>{t("messages.empty")}</p>
        ) : (
          <ul className={styles.list}>
            {threads.map((thread) => (
              <li key={thread.username}>
                <Row className={styles.row} {...rowProps(thread.username)}>
                  <span className={styles.lines}>
                    <strong>{formatUsername(thread.username)}</strong>
                    {/* The last thing said, whoever said it. Yours is marked as
                        yours rather than drawn on a side — at one line a row
                        there is no bubble to put on one. */}
                    <span className={styles.preview}>
                      {thread.mine ? t("messages.said", { body: thread.body }) : thread.body}
                    </span>
                  </span>
                  <span className={styles.side}>
                    <time dateTime={thread.time}>{relativeTime(thread.time, i18n.language, t)}</time>
                    {/* How many of theirs are waiting. A number rather than the
                        envelope's dot: a row is one person, and how much they
                        have said is worth knowing before it is opened. */}
                    {thread.unread > 0 && <span className={styles.unread}>{thread.unread}</span>}
                  </span>
                </Row>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="form-message error">{error}</p>}
    </>
  );
}
