import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal, Skeleton, TextArea } from "../../ui/index.js";
import { formatUsername, relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./message.module.css";

// The same figure the server holds a message to, so the count under the box runs
// out at the moment the send would be refused rather than after it.
const BODY_MAX = 1000;

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
export default function MessageModal({ username, onClose }) {
  const { t, i18n } = useTranslation();
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

  // Asked for when the sheet opens rather than with the page under it, the way
  // the follows lists are: most readings of a profile never write to anybody.
  //
  // Cleared on the way in, so a sheet opened on one person and then on another
  // never shows the first exchange under the second's name — and the half-typed
  // line goes with it, because a draft belongs to whoever it was being written
  // to.
  useEffect(() => {
    if (!username) return undefined;
    let cancelled = false;
    setMessages([]);
    setDraft("");
    setError("");
    setLoading(true);
    api
      .getConversation(username)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages ?? []);
        noteUnread?.(data.unread ?? 0);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username, noteUnread]);

  // The end of the thread, which is the part being had: a conversation opens on
  // its last line the way a page of one opens at the bottom, and a reply that
  // landed off screen would read as one that had not been sent.
  useEffect(() => {
    const box = threadRef.current;
    if (box) box.scrollTop = box.scrollHeight;
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
      // it: the writer is looking at the line they have just sent.
      setMessages((current) => [...current, data.message]);
      setDraft("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  }

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
        <div className={styles.thread} ref={threadRef}>
          {/* Waiting is not the same answer as none: "nothing said yet" while
              the request is still out would be a claim about two people rather
              than about the request. */}
          {messages.length === 0 ? (
            loading ? (
              <Skeleton rows={3} lines={1} label={t("common.loading")} />
            ) : (
              !error && (
                <p className={styles.empty}>
                  {t("messages.emptyThread", { name: formatUsername(username ?? "") })}
                </p>
              )
            )
          ) : (
            <ul className={styles.lines}>
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={message.mine ? `${styles.line} ${styles.mine}` : styles.line}
                >
                  {/* The words in a box and when they were said under it. Which
                      side of the sheet the box hangs on is the whole of who said
                      it — a name on every line of a conversation between two
                      people is the same two names down the page. */}
                  <span className={styles.bubble}>{message.body}</span>
                  <time className={styles.when} dateTime={message.time}>
                    {relativeTime(message.time, i18n.language, t)}
                  </time>
                </li>
              ))}
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
