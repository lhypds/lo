import { useTranslation } from "react-i18next";
import { ActionButton, AuthImage } from "../../ui/index.js";
import {
  distanceMeters,
  formatCoords,
  formatDateTime,
  formatDistance,
  formatUsername,
} from "../../utils/format.js";
import { hoverProps, rowClass } from "../../utils/hover.js";
import { directionsLink } from "../../utils/maps.js";

// The marks row, carrying a post — and now the same row in full: pressing the
// words sends the map to the spot, exactly as pressing a mark's name does. There
// is no sheet behind it any more, because there is nothing left for one to say
// that the bubble on the pin does not: the picture, the words, who left them and
// when. What the row keeps on the right is what you can do with the post rather
// than what it says — directions for anyone, editing and deleting for its author.
//
// Paired with its square on the map both ways round, the way the marks row is:
// `hovered` is the pointer resting on the square up there, and `onHover` is the
// pointer resting on this row, which opens the bubble on the square. `chosen` is
// the row that was pressed, whose bubble is being held open until it is pressed
// again — see the marks row, which wears both the same way.
export default function PostItem({
  post,
  from,
  mine = false,
  hovered = false,
  chosen = false,
  onHover,
  onShowOnMap,
  onEdit,
  onDelete,
}) {
  const { t, i18n } = useTranslation();

  // A photo with no words is a whole post; the thumbnail carries it, and the
  // line that would have held the words holds where it was taken instead.
  const headline = post.body || post.place || formatCoords(post.latitude, post.longitude);
  const away = from ? formatDistance(distanceMeters(from, post)) : "";
  const comments = post.comments ?? 0;

  return (
    <li
      className={rowClass("post-item", hovered, chosen)}
      {...hoverProps(post.id, onHover)}
    >
      <div className="post-row">
        <button
          type="button"
          className="post-copy"
          aria-label={`${t("marks.showOnMap")} ${headline}`}
          onClick={() => onShowOnMap(post)}
        >
          {post.image && (
            <AuthImage className="post-thumb" src={post.image} alt="" width="44" height="44" />
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
        {/* Two of the strings here are the marks page's. They say the same thing
            in the same words on both — a second copy under posts.* would be two
            keys to keep in step for no gain. */}
        <div className="post-side">
          {/* How far off it is and how much has been said back — the two figures
              about the post that are not the post. On one line, because the row
              is a fixed height and a third stacked line would make the list
              taller for a number most rows do not carry. The word and the
              figure in the bubble's own order, so the count on the row and the
              count in the corner of the pin read as the same thing said twice
              rather than as two different readings (see postPopupElement).
              Unlike the bubble's, this one is not a control, so nought is left
              off: there it is an invitation to be the first, here it would be
              the same "0" written down every row of a quiet neighbourhood. */}
          {(away || comments > 0) && (
            <span className="post-meta">
              {away && <span className="post-distance">{t("marks.distance", { distance: away })}</span>}
              {comments > 0 && (
                <span className="post-comments">
                  {t("comments.short")} {comments}
                </span>
              )}
            </span>
          )}
          <span className="post-actions">
            {/* Every tooltip opens leftwards, not just the one on the end: how
                many buttons there are depends on whose post this is, and a row
                where the boxes changed sides with the author would read as a
                glitch. */}
            {/* The same hand-off the marks row makes, for the same reason: a
                post is somewhere you can walk to, and walking there is Google
                Maps' job — the app on a handheld, the directions page
                elsewhere. */}
            <ActionButton
              tooltip={t("marks.navigate")}
              tooltipRight
              aria-label={`${t("marks.navigate")} ${headline}`}
              {...directionsLink(post, from)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M3 11 22 2l-9 19-2-8z" />
              </svg>
            </ActionButton>
            {/* The two a post's own author gets, in the order they are reached
                for: rewriting it, then taking it down. The pencil is the marks
                row's own, since renaming a spot and rewriting a post are the
                same kind of second thought — and what it opens is the composer
                the post was written in, so it is the same sheet either way. */}
            {mine && (
              <>
                <ActionButton
                  tooltip={t("post.edit")}
                  tooltipRight
                  aria-label={`${t("post.edit")} ${headline}`}
                  onClick={() => onEdit(post)}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </ActionButton>
                <ActionButton
                  tooltip={t("post.delete")}
                  tooltipRight
                  aria-label={`${t("post.delete")} ${headline}`}
                  onClick={() => onDelete(post)}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M4 7h16" />
                    <path d="M9 7V5h6v2" />
                    <path d="M6 7l1 13h10l1-13" />
                  </svg>
                </ActionButton>
              </>
            )}
          </span>
        </div>
      </div>
    </li>
  );
}
