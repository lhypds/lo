import { useTranslation } from "react-i18next";
import { ActionButton } from "../../ui/index.js";
import {
  distanceMeters,
  formatCoords,
  formatDateTime,
  formatDistance,
  formatUsername,
} from "../../utils/format.js";
import { directionsLink } from "../../utils/maps.js";

// The marks row, carrying a post. What differs is what the text is for: a mark
// has only a name, so pressing it sends the map there, but a post has something
// to say and pressing it opens it. Sending the map is a button on the right
// instead — first of the three, ahead of the directions the marks row also
// offers and the delete that only your own posts get.
export default function PostItem({ post, from, mine = false, onOpen, onShowOnMap, onDelete }) {
  const { t, i18n } = useTranslation();

  // A photo with no words is a whole post; the thumbnail carries it, and the
  // line that would have held the words holds where it was taken instead.
  const headline = post.body || post.place || formatCoords(post.latitude, post.longitude);
  const away = from ? formatDistance(distanceMeters(from, post)) : "";

  return (
    <li className="post-item">
      <div className="post-row">
        <button
          type="button"
          className="post-copy"
          aria-label={`${t("post.preview")} ${formatUsername(post.username)}`}
          onClick={() => onOpen(post)}
        >
          {post.image && (
            <img className="post-thumb" src={post.image} alt="" loading="lazy" width="44" height="44" />
          )}
          <span className="post-copy-lines">
            <strong>{headline}</strong>
            <span className="post-byline">
              {formatUsername(post.username)}
              {post.place && post.body ? ` · ${post.place}` : ""}
            </span>
            <time dateTime={post.time}>{formatDateTime(post.time, i18n.language)}</time>
          </span>
        </button>
        {/* Three of the strings here are the marks page's. They say the same
            thing in the same words on both — a second copy under posts.* would
            be three keys to keep in step for no gain. */}
        <div className="post-side">
          {away && <span className="post-distance">{t("marks.distance", { distance: away })}</span>}
          <span className="post-actions">
            {/* A ring on a spot rather than the marks row's paper plane: this
                row has both actions where that one has only the second, and the
                plane has to stay with the one that leaves lo. */}
            <ActionButton
              tooltip={t("marks.showOnMap")}
              aria-label={`${t("marks.showOnMap")} ${headline}`}
              onClick={() => onShowOnMap(post)}
            >
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="7" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
            </ActionButton>
            {/* The same hand-off the marks row makes, for the same reason: a
                post is somewhere you can walk to, and walking there is Google
                Maps' job — the app on a handheld, the directions page
                elsewhere. */}
            <ActionButton
              tooltip={t("marks.navigate")}
              aria-label={`${t("marks.navigate")} ${headline}`}
              {...directionsLink(post, from)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M3 11 22 2l-9 19-2-8z" />
              </svg>
            </ActionButton>
            {mine && (
              <ActionButton
                tooltip={t("post.delete")}
                aria-label={`${t("post.delete")} ${headline}`}
                onClick={() => onDelete(post)}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M4 7h16" />
                  <path d="M9 7V5h6v2" />
                  <path d="M6 7l1 13h10l1-13" />
                </svg>
              </ActionButton>
            )}
          </span>
        </div>
      </div>
    </li>
  );
}
