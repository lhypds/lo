import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { AuthImage, Link, Modal, Skeleton, TextArea } from "../../ui/index.js";
import { formatUsername, relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./comments.module.css";

// The same figure the server holds a comment to, so the count under the box runs
// out at the moment the submit would be refused rather than after it.
const BODY_MAX = 300;

// What has been said back about one post, and the box to say something yourself.
//
// A post is left on the ground for whoever comes past it, and until this sheet
// existed finding one was the end of the exchange — the bubble on the map said
// its piece and there was nothing to answer with. This is the other half of it:
// a column of what passers-by wrote, oldest first, because it is a conversation
// and a conversation is read from the top.
//
// `post` is the whole of what says the sheet is up — there is no state where it
// is open and about nothing — and it is the post itself rather than an id,
// because the sheet names what it is about at the head of the column and the row
// that opened it is already holding one.
export default function CommentsModal({ post, onClose, onAdded }) {
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

  const postId = post?.id ?? null;

  // Asked for when the sheet opens rather than with the post: a post is drawn a
  // hundred at a time on the map, and the words under one are wanted only by the
  // reader who pressed its count.
  //
  // Cleared on the way in, so a sheet opened on one post and then on another
  // never shows the first column under the second — the same care every list in
  // lo takes. The half-typed line goes with it: a draft belongs to the post it
  // was being written under.
  useEffect(() => {
    if (!postId) return undefined;
    let cancelled = false;
    setComments([]);
    setDraft("");
    setError("");
    setLoading(true);
    api
      .getComments(postId)
      .then((data) => {
        if (cancelled) return;
        setComments(data.comments ?? []);
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
  }, [postId, noteUnread]);

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
      const data = await api.addComment(postId, body);
      // Straight onto the end of the column rather than through a second read of
      // it: the writer is looking at the post they have just written under.
      setComments((current) => [...current, data.comment]);
      setDraft("");
      // And the figure back to whatever is holding the post, which on both pages
      // is the map: the count in the corner of a bubble is what said there was
      // anything here to open, and it has just changed by one.
      onAdded?.(post, data.comments);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      isOpen={Boolean(post)}
      title={t("comments.title")}
      onClose={onClose}
      closeOnOverlay
      // The composer's own width, and for the composer's own reason: this is a
      // sheet worked in rather than read off.
      wide
    >
      <div className={styles.sheet}>
        {/* Which post this is about, at the head of the column. The bubble that
            opened the sheet is behind it now, and a page of remarks with nothing
            saying what they are remarks on is a conversation walked in on. */}
        {post && (
          <p className={styles.about}>
            {post.body || post.place || t("comments.aboutPost")}
          </p>
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
              !error && <p className={styles.empty}>{t("comments.empty")}</p>
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
