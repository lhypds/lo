import { useTranslation } from "react-i18next";
import { ActionButton, AuthImage } from "../../ui/index.js";
import { distanceMeters, formatCoords, formatDateTime, formatDistance } from "../../utils/format.js";
import { hoverProps, rowClass } from "../../utils/hover.js";
import { postThumb } from "../../utils/image.js";
import { directionsLink, searchLink } from "../../utils/maps.js";
import { labelName } from "../../utils/label.js";

// The things that can be done with a spot, grouped at the right of its row —
// the same actions that the spot's own bubble carries up on the map (see
// markPopupElement in MapCard), and dropped from both in the same case. The row
// and the pin are one mark, and a reader who has learned the bubble should not
// have to learn a second set of controls to work the list underneath it.
//
// Icons in the shared action boxes, matching the post rows beside them. Their
// accessible names say the action and the mark, while pointer users get the
// same tooltips as the other list controls.
//
// The fifth thing — send the map here — is still the name itself, which is why
// it costs no word and stays the easiest thing on the row to hit.
//
// The row and its pin on the map are paired both ways round. `hovered` is the
// pointer resting on the pin, and the wash it puts on the row says which line of
// the list that pin is; `onHover` is the same thing said in the other direction,
// and what it opens up there is the bubble.
//
// `chosen` is the row that was pressed, whose bubble is being held open up there
// until it is pressed again. It wears the same wash — the preview it belongs to
// is showing, which is what the wash has always meant — and a rule down its left
// edge to say that this one is being held rather than merely pointed at.
export default function MarkItem({ mark, from, hovered = false, chosen = false, onHover, onEdit, onDelete, onShowOnMap }) {
  const { t, i18n } = useTranslation();

  // A spot nobody named is read by where it is. The coordinates move up onto the
  // row's own line and the small print under it goes, rather than the two of them
  // saying the same thing twice — and what stood there before was "Unnamed spot",
  // a name every one of them shared and none of them was told apart by.
  //
  // The name in the language this list is being read in, or the nearest thing to
  // it the spot has: a name written in another language is still a name (see
  // labelName).
  const named = labelName(mark, i18n.language);
  const coords = formatCoords(mark.latitude, mark.longitude);
  const name = named || coords;
  const away = from ? formatDistance(distanceMeters(from, mark)) : "";

  return (
    <li className={rowClass("mark-item", hovered, chosen)} {...hoverProps(mark.id, onHover)}>
      <div className="mark-row">
        <button
          type="button"
          className="mark-copy"
          aria-label={`${t("marks.showOnMap")} ${name}`}
          onClick={() => onShowOnMap(mark)}
        >
          {/* The small copy where the spot has a photograph on it, which is the
              whole point of there being one: a list of forty spots is forty of
              these, wanted at once. The post row's own thumbnail, because a
              picture taken standing somewhere is the same thing whichever list
              it ends up in (see PostItem). */}
          {mark.image && <AuthImage className="post-thumb" src={postThumb(mark)} alt="" width="40" height="40" />}
          <span className="mark-copy-lines">
            <strong className={named ? undefined : "mark-numbers"}>{name}</strong>
            {named && <span className="mark-coords">{coords}</span>}
            <time dateTime={mark.time}>{formatDateTime(mark.time, i18n.language)}</time>
          </span>
        </button>
        <div className="mark-side">
          {away && <span className="mark-distance">{t("marks.distance", { distance: away })}</span>}
          <span className="mark-actions">
            {/* Only where somebody wrote something on the spot. A search is a
                question asked in words, and a mark with no name has none to ask
                it in — what went out then was its own coordinates, which come
                back as the pin the reader is already looking at. */}
            {named && (
              <ActionButton
                tooltip={t("map.search")}
                tooltipRight
                aria-label={`${t("map.search")} ${name}`}
                {...searchLink(mark, named)}
              >
                <svg viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
              </ActionButton>
            )}
            <ActionButton
              tooltip={t("map.nav")}
              tooltipRight
              aria-label={`${t("map.nav")} ${name}`}
              {...directionsLink(mark, from)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M3 11 22 2l-9 19-2-8z" />
              </svg>
            </ActionButton>
            <ActionButton
              tooltip={t("map.edit")}
              tooltipRight
              aria-label={`${t("map.edit")} ${name}`}
              onClick={() => onEdit(mark)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </ActionButton>
            <ActionButton
              tooltip={t("map.delete")}
              tooltipRight
              aria-label={`${t("map.delete")} ${name}`}
              onClick={() => onDelete(mark)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M4 7h16" />
                <path d="M9 7V5h6v2" />
                <path d="M6 7l1 13h10l1-13" />
              </svg>
            </ActionButton>
          </span>
        </div>
      </div>
    </li>
  );
}
