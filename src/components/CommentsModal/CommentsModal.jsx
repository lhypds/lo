import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { AuthImage, Link, Modal, Skeleton, TextArea } from "../../ui/index.js";
import { formatUsername, relativeTime } from "../../utils/format.js";
import { postThumb } from "../../utils/image.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./comments.module.css";

// The same figure the server holds a comment to, so the count under the box runs
// out at the moment the submit would be refused rather than after it.
const BODY_MAX = 300;

// What has been said back about one post, OSM venue or Wikipedia landmark, and
// the box to say something yourself.
//
// A post, a public venue or a landmark somebody has read about is on the
// ground for whoever comes past it. The bubble on the map says its piece; this
// is the other half of the exchange: a column of what passers-by wrote, oldest
// first, because a conversation is read from the top.
//
// The subject itself is the whole of what says the sheet is up — there is no
// state where it is open and about nothing — because the sheet names what it is
// about at the head of the column and the pin that opened it already holds the
// object. `post` remains the ordinary path in; `venue` selects the parallel
// endpoints while reusing every pixel and state transition below — a place off
// Wikipedia is handed in through the same prop, since its comment thread is
// filed under the same table (see VENUE_COMMENT_TYPES in server/index.js).
export default function CommentsModal({ post = null, venue = null, onClose, onAdded }) {
  const { t, i18n } = useTranslation();
  // Opening this column is what reads it — a remark under your post waits in the
  // same inbox a letter does — and the answer says how much is left waiting
  // anywhere, so the dot in the top bar goes out as the words arrive rather than
  // on the next turn of the presence loop.
  const { noteUnread } = useHere();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const subject = venue ?? post;
  const subjectId = subject?.id ?? null;
  const venueThread = Boolean(venue);
  // The picture the subject is known by, where there is one: a post's own
  // thumbnail, or the small copy of a landmark's Wikimedia picture — the same
  // two files the row and the pin draw, so this box is very often already
  // fetched by the time the sheet opens. Null for a post left with words alone
  // and for an OSM venue, which never carries a picture at all; the head of the
  // column is then the caption by itself, as before.
  const thumb = venue ? venue.thumbnailSmall || venue.thumbnail || null : postThumb(post);

  // Asked for when the sheet opens rather than with the map list: pins are drawn
  // many at a time, and the words under one are wanted only by the reader who
  // pressed its count.
  //
  // Cleared on the way in, so a sheet opened on one subject and then on another
  // never shows the first column under the second — the same care every list in
  // lo takes. The half-typed line goes with it: a draft belongs to the thing it
  // was being written under.
  useEffect(() => {
    if (!subjectId) return undefined;
    let cancelled = false;
    setComments([]);
    setDraft("");
    setError("");
    setLoading(true);
    const read = venueThread ? api.getVenueComments(subjectId) : api.getComments(subjectId);
    read
      .then((data) => {
        if (cancelled) return;
        setComments(data.comments ?? []);
        // Venue threads have no owner and therefore no inbox notification to
        // mark read. A post response carries the updated global unread figure.
        if (!venueThread) noteUnread?.(data.unread ?? 0);
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
  }, [subjectId, venueThread, noteUnread]);

  // The end of the column, which is the part being added to: a comment that
  // landed off screen would read as one that had not been submitted.
  useEffect(() => {
    const box = listRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [comments]);

  async function submit(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const data = venueThread
        ? await api.addVenueComment(subjectId, body)
        : await api.addComment(subjectId, body);
      // Straight onto the end of the column rather than through a second read of
      // it: the writer is looking at the subject they have just written under.
      setComments((current) => [...current, data.comment]);
      setDraft("");
      // And the figure back to whatever is holding the subject, which on both paths
      // is the map: the count in the corner of a bubble is what said there was
      // anything here to open, and it has just changed by one.
      onAdded?.(subject, data.comments);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      isOpen={Boolean(subject)}
      // Which of the two conversations this is. They are the same column of
      // remarks read the same way, and in some languages they are not the same
      // word: what is written under a public place is a review of somewhere
      // anybody can walk into, and what is written under a post is a word back
      // to the person who left it. English calls both of them comments, so the
      // pair of keys carries one string there and two in Chinese.
      title={t(venueThread ? "comments.venueTitle" : "comments.title")}
      onClose={onClose}
      closeOnOverlay
      // The composer's own width, and for the composer's own reason: this is a
      // sheet worked in rather than read off.
      wide
    >
      <div className={styles.sheet}>
        {/* What this is about, at the head of the column. The bubble that opened
            the sheet is behind it now, and a page of remarks with nothing saying
            what they are remarks on is a conversation walked in on. */}
        {subject && (
          <div className={styles.about}>
            {/* The picture beside the words rather than above them: this line is
                the label on the column, and a photograph across the head of the
                sheet would be the post being shown again rather than named.
                AuthImage for both kinds — a stored picture needs the session on
                its request and a Wikimedia one does not, which is the one thing
                that function already sorts out by itself (see authImageUrl). */}
            {thumb && (
              <AuthImage
                className={styles.thumb}
                src={thumb}
                alt=""
                loading="lazy"
                width="40"
                height="40"
              />
            )}
            {/* A landmark's own name is Wikipedia's `title` rather than the
                `name` an OSM venue answers with — the one field the two kinds
                of place under this same sheet disagree about the word for. */}
            <p className={styles.subject}>
              {venue ? venue.name ?? venue.title : post.body || post.place || t("comments.aboutPost")}
            </p>
          </div>
        )}

        {/* A definite height, so the box stands on the floor of the sheet and the
            column scrolls above it rather than pushing it off the bottom. */}
        <div className={styles.list} ref={listRef}>
          {/* Waiting is not the same answer as none: "nobody has said anything"
              while the request is still out would be a claim about the post
              rather than about the request. */}
          {comments.length === 0 ? (
            loading ? (
              <Skeleton rows={3} lines={2} label={t("common.loading")} />
            ) : (
              !error && (
                <p className={styles.empty}>
                  {t(venueThread ? "comments.venueEmpty" : "comments.empty")}
                </p>
              )
            )
          ) : (
            <ul className={styles.items}>
              {comments.map((comment) => (
                <li key={comment.id} className={styles.item}>
                  {comment.avatar && (
                    <AuthImage
                      className={styles.avatar}
                      src={comment.avatar}
                      alt=""
                      loading="lazy"
                      width="28"
                      height="28"
                    />
                  )}
                  <div className={styles.lines}>
                    <div className={styles.head}>
                      {/* Through to the person, which is the one thing to do with
                          a name here — the same hand-off the byline in the bubble
                          on the map makes, and to the same page. */}
                      <Link
                        to={`/${encodeURIComponent(comment.username)}`}
                        className={styles.who}
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                          onClose();
                        }}
                      >
                        {formatUsername(comment.username)}
                      </Link>
                      <time className={styles.when} dateTime={comment.time}>
                        {relativeTime(comment.time, i18n.language, t)}
                      </time>
                    </div>
                    <p className={styles.body}>{comment.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The box, under what it is answering, with the one thing to do about it
            at the bottom of the box — which is the shape every sheet in lo that
            takes typing has. */}
        <form className={styles.composer} onSubmit={submit} autoComplete="off">
          <TextArea
            className={styles.text}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
            // Cmd/Ctrl+Enter sends it, the same key the post composer takes: a
            // remark is written in the same kind of box and is finished the same
            // way. A plain Enter stays a newline — a comment can be a paragraph,
            // and the composing check keeps the Enter that closes a Japanese or
            // Chinese candidate list from being read as the one that submits.
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
                submit(event);
              }
            }}
            placeholder={t("comments.placeholder")}
            maxLength={BODY_MAX}
            rows={2}
            minHeight={64}
            disabled={sending}
          />
          <div className={styles.footer}>
            <span className={styles.count}>
              {draft.length}/{BODY_MAX}
            </span>
            <button type="submit" className="primary-button" disabled={sending || !draft.trim()}>
              {sending ? t("comments.sending") : t("comments.submit")}
            </button>
          </div>
        </form>

        {error && <p className="form-message error">{error}</p>}
      </div>
    </Modal>
  );
}
