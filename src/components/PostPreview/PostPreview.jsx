import { useTranslation } from "react-i18next";
import { Modal } from "../../ui/index.js";
import {
  distanceMeters,
  formatCoords,
  formatDateTime,
  formatDistance,
  formatUsername,
} from "../../utils/format.js";
import { useAuth } from "../AuthProvider/index.js";
import styles from "./preview.module.css";

// A post opened from its square on the map: the picture first, since that is
// what the square was standing in for, then what was written and by whom.
// Deleting is offered only on your own, and hands off to the page's confirm the
// way the marks list does rather than stacking a second sheet on this one.
export default function PostPreview({ post, from, onClose, onDelete }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const mine = Boolean(post && user && post.username === user.username);
  const away = post && from ? formatDistance(distanceMeters(from, post)) : "";

  // `wide` is the width the composer takes: a post is read at the size it was
  // written at, and the photo is the biggest thing in either sheet.
  return (
    <Modal isOpen={Boolean(post)} title={t("post.preview")} onClose={onClose} closeOnOverlay wide>
      {post && (
        <div className={styles.body}>
          {post.image && (
            <div className={styles.frame}>
              {/* The picture is the post's own content and its stored name is a
                  digest of its bytes — there is nothing to read out here that
                  the text below does not already say. */}
              <img
                className={styles.image}
                src={post.image}
                alt=""
                width={post.imageWidth || undefined}
                height={post.imageHeight || undefined}
              />
            </div>
          )}

          {post.body && <p className={styles.text}>{post.body}</p>}

          {/* Who, where and when as two lines of mono rather than as a labelled
              table of three rows — the same three facts the row in the list
              carries, in the same shape, and a third of the height. Nothing here
              needs a label: an @name is a name and a timestamp is a time. */}
          <div className={styles.footer}>
            <span className={styles.meta}>
              <span className={styles.line}>
                {[formatUsername(post.username), post.place || formatCoords(post.latitude, post.longitude)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className={styles.line}>
                <time dateTime={post.time}>{formatDateTime(post.time, i18n.language)}</time>
                {away && ` · ${t("marks.distance", { distance: away })}`}
              </span>
            </span>
            {/* Bottom right, and only as wide as the word: a full-width bar
                across the foot of the sheet reads as the thing to press on the
                way out, which is the last thing deleting should look like. */}
            {mine && (
              <button type="button" className={styles.delete} onClick={() => onDelete(post)}>
                {t("post.delete")}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
