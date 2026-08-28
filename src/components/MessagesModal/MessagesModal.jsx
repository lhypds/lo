import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { AuthImage, Modal, Skeleton } from "../../ui/index.js";
import { formatUsername, relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import MessageModal from "../MessageModal/index.js";
import styles from "./messages.module.css";

// The inbox, over whatever page the reader was on. A sheet rather than a page of
// its own, on the same terms as the account: what somebody said to you is
// something you glance at and put down, and the ✕ puts you back exactly where
// you were standing rather than leaving a trip to work out afterwards.
//
// A list of people and not of letters. Which direction a message went is a fact
// about that message, not a place it lives — filing them under "in" and "out"
// would cut one conversation in half and put the halves in different boxes. So
// each row is somebody, wearing the last thing either of you said, and pressing
// one opens the exchange (see MessageModal).
export default function MessagesModal({ isOpen, onClose }) {
  const { t, i18n } = useTranslation();
  const { noteUnread } = useHere();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Which exchange is open over the list, and nothing when none is. The list
  // stays up underneath: closing a thread is going back to the inbox, which is
  // where the reader was a press ago.
  const [reading, setReading] = useState(null);

  // Two things ask for the list — the sheet opening, and coming back from a
  // thread — so a slower earlier answer must not overwrite a newer one. The
  // ticket is what the provider's own fetches are guarded with, for the same
  // reason.
  const askedRef = useRef(0);

  const load = useCallback(() => {
    const ticket = ++askedRef.current;
    setLoading(true);
    setError("");
    api
      .getMessages()
      .then((data) => {
        if (ticket !== askedRef.current) return;
        setConversations(data.conversations ?? []);
        // The figure comes back with the list, so the dot in the bar agrees with
        // what is on screen under it rather than with the last turn of the
        // presence loop.
        noteUnread?.(data.unread ?? 0);
      })
      .catch((requestError) => {
        if (ticket === askedRef.current) setError(requestError.message);
      })
      .finally(() => {
        if (ticket === askedRef.current) setLoading(false);
      });
  }, [noteUnread]);

  // Asked for when the sheet opens rather than kept current behind it: the bar's
  // dot is what says whether opening it is worth doing, and it rides on the
  // presence loop already turning (see LocationProvider).
  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  // Coming back from a thread, the list is a line out of date: the reply just
  // sent is the last thing said, and the unread marks on that row have been
  // cleared by the reading. Both are one question, and it is the one this sheet
  // asks on opening.
  // Which row has its delete revealed, and nothing when none has. One at a time:
  // a swipe on one row is also the gesture that puts any other row back.
  const [revealed, setRevealed] = useState(null);
  // The swipe in progress, and the flag that keeps the click a horizontal drag
  // raises from being read as a tap that opens the thread.
  const swipe = useRef(null);
  const swiped = useRef(false);

  function onSwipeStart(event, username) {
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, username };
  }

  function onSwipeEnd(event) {
    const gesture = swipe.current;
    swipe.current = null;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    // A horizontal move and not a scroll or a tap: left reveals this row's
    // delete, right puts it away.
    if (Math.abs(dx) <= 8 || Math.abs(dx) <= Math.abs(dy)) return;
    swiped.current = true;
    setRevealed(dx < 0 ? gesture.username : null);
  }

  // A press on the row: the thread, unless the row is a drag being finished or a
  // delete standing open — either of which the press is putting away rather than
  // opening.
  function openThread(username) {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (revealed) {
      setRevealed(null);
      return;
    }
    setReading(username);
  }

  function closeThread() {
    setReading(null);
    setRevealed(null);
    load();
  }

  // A whole exchange taken down from the inbox. Dropped from the list the moment
  // the server says it is gone rather than through a second read of it — soft on
  // its side (every line stamped, not removed), gone from here.
  async function remove(username) {
    setRevealed(null);
    setError("");
    try {
      await api.deleteConversation(username);
      setConversations((current) => current.filter((conversation) => conversation.username !== username));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <>
      <Modal isOpen={isOpen} title={t("messages.title")} onClose={onClose} closeOnOverlay wide>
        <div className={styles.sheet}>
          {error && <p className="form-message error">{error}</p>}

          {/* Waiting is not the same answer as none — the rule every list in lo
              is drawn by. */}
          {conversations.length === 0 ? (
            loading ? (
              <Skeleton rows={4} lines={2} label={t("common.loading")} />
            ) : (
              !error && <p className={styles.empty}>{t("messages.empty")}</p>
            )
          ) : (
            <ul className={styles.list}>
              {conversations.map((conversation) => (
                <li key={conversation.username} className={styles.row}>
                  {/* The row slides left under a swipe to uncover the delete
                      behind it (see .slider / .delete); the button underneath is
                      the whole exchange taken down. A row with something unread on
                      it wears the warning wash rather than a mark of its own. */}
                  <div
                    className={[
                      styles.slider,
                      revealed === conversation.username && styles.revealed,
                      conversation.unread > 0 && styles.unread,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onPointerDown={(event) => onSwipeStart(event, conversation.username)}
                    onPointerUp={onSwipeEnd}
                    onPointerCancel={() => {
                      swipe.current = null;
                    }}
                  >
                    <button type="button" className={styles.item} onClick={() => openThread(conversation.username)}>
                      {conversation.avatar && (
                        <AuthImage className={styles.avatar} src={conversation.avatar} alt="" width="28" height="28" />
                      )}
                      <span className={styles.lines}>
                        <span className={styles.who}>{formatUsername(conversation.username)}</span>
                        {/* The last thing said, whoever said it, marked when it was
                            the reader's own: without that a row reads as something
                            waiting to be answered when it is the answer. When it
                            was said leads the line — the time is read first, then
                            the words it dates. */}
                        <span className={styles.preview}>
                          <time className={styles.when} dateTime={conversation.time}>
                            {relativeTime(conversation.time, i18n.language, t)}
                          </time>
                          <span className={styles.previewText}>
                            {conversation.mine ? t("messages.said", { body: conversation.body }) : conversation.body}
                          </span>
                        </span>
                      </span>
                    </button>
                  </div>
                  {/* Behind the row until a swipe uncovers it: a sibling of the
                      slider rather than inside it, since one control cannot sit
                      within another. */}
                  <button
                    type="button"
                    className={styles.delete}
                    onClick={() => remove(conversation.username)}
                    aria-label={t("messages.delete")}
                    title={t("messages.delete")}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h16" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M6 7l1 13h10l1-13" />
                      <path d="M9 7V4h6v3" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {/* Beside the inbox rather than inside it: two sheets, one over the other,
          which is what the modal's own counter is for (see ui/Modal). Nested, it
          would be a fixed box inside a scrolling column — out here it is the
          page's child, like every other sheet in lo. */}
      <MessageModal username={reading} onClose={closeThread} />
    </>
  );
}
