import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal } from "../../ui/index.js";
import { formatUsername, relativeTime } from "../../utils/format.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
import { openProfile } from "../UserModal/userApi.js";
import { register } from "./messagesApi.js";
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

// A username is the whole address, so it is read the way the server reads it.
function normalize(value) {
  return String(value ?? "").trim().normalize("NFKC").toLowerCase();
}


// Messages, in the two views a conversation needs: everyone you have traded a
// word with, and one of those in full. A sheet rather than a page of its own —
// reading what somebody said to you is not somewhere you go, it is something you
// glance at and put down, and the dashboard underneath is still the answer to
// where you are. It is also why there is no back arrow to work out afterwards:
// the ✕ puts you exactly where you were.
//
// Mounted once, by the top bar, and opened from anywhere through messagesApi —
// the envelope up there and "send a message" on a profile are the same gesture
// arriving from two places.
export default function MessagesModal() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  // The dot on the envelope counts what is waiting, and reading a thread is what
  // clears it — so every answer below hands the new count back.
  const { noteUnread } = useHere();
  const [open, setOpen] = useState(false);
  // The name of the thread on screen, or nothing for the list of them. This is
  // the sheet's own state rather than a query on the URL: the sheet does not
  // change the page it is over, so the page's address should not change either.
  const [to, setTo] = useState(null);
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

  useEffect(
    () =>
      register((username) => {
        setTo(username ? normalize(username) : null);
        setOpen(true);
      }),
    [],
  );

  const load = useCallback(async () => {
    if (!open) return;
    // Three things reach this — the sheet opening, the loop, and a tab coming
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
  }, [open, to, noteUnread]);

  // The thread on screen belongs to the name held above it, so changing the name
  // empties it first: one person's words under another person's name is the one
  // thing this must never show, and a half-written line is addressed to whoever
  // was on screen when it was typed.
  useEffect(() => {
    setMessages([]);
    setBody("");
  }, [to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
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
  }, [open, load]);

  // A thread is read from the bottom: the newest line is the one being answered,
  // and it is the composer's own neighbour.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages.length]);

  // Arriving from a profile, the composer is the whole reason the sheet opened
  useEffect(() => {
    if (!open || !to) return undefined;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open, to]);

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
    }
  }

  return (
    <Modal
      isOpen={open}
      // In a thread the name is also the way back to the list, which is the only
      // place inside the sheet there is to go back to.
      title={
        to ? (
          <button type="button" className={styles.back} onClick={() => setTo(null)}>
            <span aria-hidden="true">‹</span> {formatUsername(to)}
          </button>
        ) : (
          t("messages.title")
        )
      }
      onClose={() => setOpen(false)}
      closeOnOverlay
      // The composer's own width, for the same reason it has it: this is a sheet
      // worked in rather than read off. Every row here is a name and a line of
      // somebody's writing on one line, and at the narrow size the line was the
      // half that got cut.
      wide
    >
      {to ? (
        <div className={styles.thread}>
          {/* Through to the whole of whoever is being written to. A thread says
              what somebody has said and nothing about who they are, and that is
              the question a name at the top of a conversation raises — so the
              answer is one press from the top of it.
              It hands the sheet over rather than stacking a second one on top:
              the same swap the profile makes in the other direction, where "send
              a message" closes the profile and opens this. One sheet at a time,
              and the row back is always on the other side. */}
          <div className={styles.who}>
            <button
              type="button"
              className={styles.profile}
              onClick={() => {
                setOpen(false);
                openProfile(to);
              }}
            >
              {t("messages.profile")}
            </button>
          </div>
          <div className={styles.scroll} ref={scrollRef}>
            {messages.length === 0 ? (
              <p className={styles.empty}>
                {t("messages.emptyThread", { name: formatUsername(to) })}
              </p>
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
            {/* The naming sheet's own row, at the scale a sheet asks for a line
                of text in — see .mark-field in styles.css. */}
            <div className="joined-field mark-field">
              <input
                ref={inputRef}
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  setError("");
                }}
                placeholder={t("messages.placeholder")}
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
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 5v6a4 4 0 0 1-4 4H4" />
                  <path d="m9 10-5 5 5 5" />
                </svg>
              </button>
            </div>
            {error && <p className="form-message error">{error}</p>}
          </form>
        </div>
      ) : (
        // Who you talk to, and how each conversation was left. A row is a person
        // and pressing one opens what was said, which is the whole of the sheet:
        // there is nothing here a name does not answer.
        <div className={styles.threads}>
          {threads.length === 0 ? (
            <p className={styles.empty}>{t("messages.empty")}</p>
          ) : (
            <ul className={styles.list}>
              {threads.map((thread) => (
                <li key={thread.username}>
                  <button type="button" className={styles.row} onClick={() => setTo(thread.username)}>
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
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="form-message error">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
