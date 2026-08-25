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

  return (
    <Modal isOpen={Boolean(post)} title={t("post.preview")} onClose={onClose} closeOnOverlay>
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

          <dl className={styles.meta}>
            <div>
              <dt>{t("post.by")}</dt>
              <dd>{formatUsername(post.username)}</dd>
            </div>
            <div>
              <dt>{t("post.where")}</dt>
              <dd>
                {post.place || formatCoords(post.latitude, post.longitude)}
                {away && <span className={styles.away}>{t("marks.distance", { distance: away })}</span>}
              </dd>
            </div>
            <div>
              <dt>{t("post.when")}</dt>
              <dd>
                <time dateTime={post.time}>{formatDateTime(post.time, i18n.language)}</time>
              </dd>
            </div>
          </dl>

          {mine && (
            <button type="button" className="outline-button" onClick={() => onDelete(post)}>
              {t("post.delete")}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
