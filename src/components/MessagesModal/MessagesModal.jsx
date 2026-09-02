import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { AuthImage, Link, Modal, Skeleton } from "../../ui/index.js";
import { nameLink } from "../../utils/back.js";
import { formatUsername, relativeTime } from "../../utils/format.js";
import CommentsModal from "../CommentsModal/index.js";
import { useHere } from "../LocationProvider/index.js";
import MessageModal from "../MessageModal/index.js";
import styles from "./messages.module.css";

// Which row a row is. Three kinds share this list and no kind's name is unique
// against another's — the person you trade letters with may be the person who
// followed you — so what identifies a row is its kind and the thing it is about:
// a person by name, a post by number, a follower by name again under its own
// prefix.
const rowKey = (row) => `${row.kind}:${row.kind === "post" ? row.postId : row.username}`;

// The inbox, over whatever page the reader was on. A sheet rather than a page of
// its own, on the same terms as the account: what somebody said to you is
// something you glance at and put down, and the ✕ puts you back exactly where
// you were standing rather than leaving a trip to work out afterwards.
//
// A list of conversations and not of letters. Which direction a message went is
// a fact about that message, not a place it lives — filing them under "in" and
// "out" would cut one conversation in half and put the halves in different
// boxes.
//
// Three kinds of row, because there are three ways somebody says something to
// you here: a letter, which is addressed; a remark under a post, which is left
// in the open for whoever comes past; and a follow, which says nothing in words
// but is said to you all the same — "I am reading you". All three are somebody
// turning to you, so all three are read down one column, newest first — what
// differs is what a row is about and where the press goes. A person opens the
// exchange (see MessageModal); a post opens its comment column (see
// CommentsModal), and is in the list because the post is yours or because you
// have written under it; a follower opens their page, which is the whole of
// what there is to do about one, and having it in front of you is what marks
// the row read (see GET /api/users/:username).
//
// `open` is a thread to stand on rather than a list to look at: the sheet is
// being put back up for a reader who left one of its conversations by pressing a
// name in it, and what they left was the conversation (see utils/back.js).
export default function MessagesModal({ isOpen, open = null, onClose }) {
  const { t, i18n } = useTranslation();
  const { noteUnread } = useHere();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Which exchange is open over the list, and nothing when none is. The list
  // stays up underneath: closing a thread is going back to the inbox, which is
  // where the reader was a press ago.
  //
  // One for each kind, and never both: a press opens one row, and which of these
  // it fills is the whole of what kind that row was.
  const [reading, setReading] = useState(null);
  const [readingPost, setReadingPost] = useState(null);

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

  // And the conversation over it, where the sheet was opened on one. The list
  // underneath is asked for all the same: it is what closing the thread goes
  // back to, and it should be the list as it stands rather than as it stood
  // before the trip. Only on the way in — a thread closed afterwards is closed,
  // and the reader is looking at the inbox they came back to.
  useEffect(() => {
    if (!isOpen || !open) return;
    if (open.kind === "post") setReadingPost(open.post);
    else setReading(open.username);
  }, [isOpen, open]);

  // Which row has its delete revealed, and nothing when none has. One at a time:
  // a swipe on one row is also the gesture that puts any other row back.
  const [revealed, setRevealed] = useState(null);

  // What a follower's row does on the way out: the inbox written down as the
  // sheet to come back to — the list itself rather than any thread in it, since
  // the row was the whole of the news — and the sheet closed, because what the
  // press leads to is a page (see nameLink in utils/back.js).
  const leave = nameLink({ kind: "inbox" }, onClose);
  // The swipe in progress, and the flag that keeps the click a horizontal drag
  // raises from being read as a tap that opens the thread.
  const swipe = useRef(null);
  const swiped = useRef(false);

  function onSwipeStart(event, key) {
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, key };
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
    setRevealed(dx < 0 ? gesture.key : null);
  }

  // A press on the row: whichever sheet the row is about, unless the row is a
  // drag being finished or a delete standing open — either of which the press is
  // putting away rather than opening.
  //
  // What a post row hands on is the little of the post the sheet needs to name
  // what the column is under: its words, or where it was left, and the picture
  // it was left with. The rest of the post is on the map, which is not what the
  // reader is looking at.
  //
  // The picture goes across because the sheet draws it, and a comment column
  // opened from here is the same column the pin on the map opens — one that
  // named the post by its photograph and one that named it by its words would
  // be two sheets. It goes over as `imageThumb` because that is what the row's
  // own `image` already is — the small copy where the post has one and the
  // picture itself where it does not (see selectPostThreads), which is the
  // choice postThumb makes on the other side of this anyway, and very often a
  // file already fetched for the square on this row.
  function openThread(conversation) {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (revealed) {
      setRevealed(null);
      return;
    }
    if (conversation.kind === "post") {
      setReadingPost({
        id: conversation.postId,
        body: conversation.post,
        place: conversation.place,
        imageThumb: conversation.image,
      });
      return;
    }
    setReading(conversation.username);
  }

  // Coming back from either sheet, the list is a line out of date: the reply just
  // sent is the last thing said, and the marks on that row have been cleared by
  // the reading. Both are one question, and it is the one this sheet asks on
  // opening.
  function closeThread() {
    setReading(null);
    setReadingPost(null);
    setRevealed(null);
    load();
  }

  // A whole exchange taken down from the inbox. Dropped from the list the moment
  // the server says it is gone rather than through a second read of it — soft on
  // its side (every line stamped, not removed), gone from here.
  //
  // Letters only. A comment column is not yours to take down — it is public, it
  // is under somebody's post, and the people in it are still talking — so a post
  // row has no delete behind it and no swipe to find one with.
  async function remove(username) {
    setRevealed(null);
    setError("");
    try {
      await api.deleteConversation(username);
      setConversations((current) =>
        current.filter((conversation) => conversation.kind === "post" || conversation.username !== username),
      );
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
              {conversations.map((conversation) => {
                const key = rowKey(conversation);
                const onPost = conversation.kind === "post";
                const onFollow = conversation.kind === "follow";
                // A letter is the one kind with something behind it (see remove),
                // so it is the one kind that slides and the one with a delete.
                const letter = conversation.kind === "person";
                // What the row is headed by. A letter is headed by whoever wrote
                // it, because that is the whole of what the exchange is about; a
                // column is headed by the post it hangs under, said as a remark
                // about it — the words themselves, or where they were left, or
                // the plainest thing there is to call a post with neither; a
                // follow is headed by the follower, the way a letter is.
                const about = onPost
                  ? t("messages.onPost", {
                      post: conversation.post || conversation.place || t("comments.aboutPost"),
                    })
                  : formatUsername(conversation.username);
                // Whichever picture the thread has: the correspondent's face on a
                // letter or a follow, and on a column the photo that was posted —
                // which is what a reader recognises the post by, the way they
                // recognise a person by theirs.
                const picture = onPost ? conversation.image : conversation.avatar;
                // The face of the row — picture, name, last line — made once and
                // put in whichever control the kind calls for below.
                const face = (
                  <>
                    {picture && (
                      <AuthImage className={styles.avatar} src={picture} alt="" width="28" height="28" />
                    )}
                    <span className={styles.lines}>
                      <span className={styles.who}>{about}</span>
                      {/* The last thing said, whoever said it, marked when it was
                          the reader's own: without that a row reads as something
                          waiting to be answered when it is the answer. Under a
                          post the name comes with it, because a column has as
                          many voices in it as came past and the head of the row
                          names the post rather than any of them. A follow said
                          nothing in words, so the row says it in lo's. When it
                          was said leads the line — the time is read first, then
                          the words it dates. */}
                      <span className={styles.preview}>
                        <time className={styles.when} dateTime={conversation.time}>
                          {relativeTime(conversation.time, i18n.language, t)}
                        </time>
                        <span className={styles.previewText}>
                          {onFollow
                            ? t("messages.followed")
                            : conversation.mine
                              ? t("messages.said", { body: conversation.body })
                              : onPost
                                ? t("messages.saidBy", {
                                    name: formatUsername(conversation.username),
                                    body: conversation.body,
                                  })
                                : conversation.body}
                        </span>
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={key} className={styles.row}>
                    {/* The row slides left under a swipe to uncover the delete
                        behind it (see .slider / .delete); the button underneath is
                        the whole exchange taken down. A row with something unread on
                        it wears the warning wash rather than a mark of its own.

                        A post row and a follower's row do neither: there is nothing
                        behind either to uncover, so neither is given a gesture that
                        would carry it left onto bare paper. */}
                    <div
                      className={[
                        styles.slider,
                        revealed === key && styles.revealed,
                        conversation.unread > 0 && styles.unread,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onPointerDown={letter ? (event) => onSwipeStart(event, key) : undefined}
                      onPointerUp={letter ? onSwipeEnd : undefined}
                      onPointerCancel={
                        letter
                          ? () => {
                              swipe.current = null;
                            }
                          : undefined
                      }
                    >
                      {/* A follower's row is a link and the other two are buttons,
                          for what is on the far side of the press: their page has
                          an address, and a sheet over this one does not. The sheet
                          goes with the press and writes itself down on the way out,
                          so the ← on that page comes back to the inbox (see
                          utils/back.js) — bar a delete standing open on some other
                          row, which the press puts away instead, the same as a
                          press on any row here does. */}
                      {onFollow ? (
                        <Link
                          to={`/${encodeURIComponent(conversation.username)}`}
                          className={styles.item}
                          state={leave.state}
                          onClick={(event) => {
                            if (revealed) {
                              event.preventDefault();
                              setRevealed(null);
                              return;
                            }
                            leave.onClick(event);
                          }}
                        >
                          {face}
                        </Link>
                      ) : (
                        <button type="button" className={styles.item} onClick={() => openThread(conversation)}>
                          {face}
                        </button>
                      )}
                    </div>
                    {/* Behind the row until a swipe uncovers it: a sibling of the
                        slider rather than inside it, since one control cannot sit
                        within another. */}
                    {letter && (
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
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      {/* Beside the inbox rather than inside it: two sheets, one over the other,
          which is what the modal's own counter is for (see ui/Modal). Nested, it
          would be a fixed box inside a scrolling column — out here it is the
          page's child, like every other sheet in lo.

          One for each kind of row that opens a sheet, and the same sheet the
          rest of lo opens on either: the exchange a name on a profile writes
          into, and the comment column a bubble on the map opens. A row here is
          a way back to a conversation, not a second place to have it. A
          follower's row has no sheet — it leaves for their page. */}
      {/* And the way back out of either of them, for a reader who presses one of
          the names inside: the inbox standing on this thread is what the ← on
          that person's profile comes back to, which is two sheets rather than
          one — the list, and the conversation over it (see utils/back.js). */}
      <MessageModal
        username={reading}
        back={reading ? { kind: "inbox", thread: { kind: "person", username: reading } } : null}
        onClose={closeThread}
      />
      <CommentsModal
        post={readingPost}
        back={readingPost ? { kind: "inbox", thread: { kind: "post", post: readingPost } } : null}
        onClose={closeThread}
      />
    </>
  );
}
