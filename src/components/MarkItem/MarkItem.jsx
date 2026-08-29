import { useTranslation } from "react-i18next";
import { ActionButton } from "../../ui/index.js";
import { distanceMeters, formatCoords, formatDateTime, formatDistance } from "../../utils/format.js";
import { hoverProps, rowClass } from "../../utils/hover.js";
import { directionsLink } from "../../utils/maps.js";
import { placeName } from "../../utils/place.js";

// Three actions, out on the row where they can be seen rather than behind a
// swipe nothing announces. The fourth — send the map here — is the name itself,
// so it costs no button and stays the easiest thing on the row to hit.
// The row and its pin on the map are paired both ways round. `hovered` is the
// pointer resting on the pin, and the wash it puts on the row says which line of
// the list that pin is; `onHover` is the same thing said in the other direction,
// and what it opens up there is the bubble.
//
// `chosen` is the row that was pressed, whose bubble is being held open up there
// until it is pressed again. It wears the same wash — the preview it belongs to
// is showing, which is what the wash has always meant — and a rule down its left
// edge to say that this one is being held rather than merely pointed at.
export default function MarkItem({
  mark,
  from,
  hovered = false,
  chosen = false,
  onHover,
  onRename,
  onDelete,
  onShowOnMap,
}) {
  const { t, i18n } = useTranslation();

  const name = mark.label || placeName(mark, i18n.language) || t("marks.unnamed");
  const away = from ? formatDistance(distanceMeters(from, mark)) : "";

  return (
    <li
      className={rowClass("mark-item", hovered, chosen)}
      {...hoverProps(mark.id, onHover)}
    >
      <div className="mark-row">
        <button
          type="button"
          className="mark-copy"
          aria-label={`${t("marks.showOnMap")} ${name}`}
          onClick={() => onShowOnMap(mark)}
        >
          <strong>{name}</strong>
          <span className="mark-coords">{formatCoords(mark.latitude, mark.longitude)}</span>
          <time dateTime={mark.time}>{formatDateTime(mark.time, i18n.language)}</time>
        </button>
        <div className="mark-side">
          {away && <span className="mark-distance">{t("marks.distance", { distance: away })}</span>}
          <span className="mark-actions">
            {/* Turn-by-turn is a thing a phone in a pocket does well and a card
                on a dashboard does badly, so this hands the spot to Google Maps
                — the app on a handheld, the directions page on a desktop —
                rather than drawing a line lo cannot then follow. */}
            {/* Leftwards, like the posts row's: this list clips sideways too,
                and the box under the last button is cut off without it. */}
            <ActionButton
              tooltip={t("marks.navigate")}
              tooltipRight
              aria-label={`${t("marks.navigate")} ${name}`}
              {...directionsLink(mark, from)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M3 11 22 2l-9 19-2-8z" />
              </svg>
            </ActionButton>
            <ActionButton
              tooltip={t("marks.rename")}
              tooltipRight
              aria-label={`${t("marks.rename")} ${name}`}
              onClick={() => onRename(mark)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </ActionButton>
            <ActionButton
              tooltip={t("marks.delete")}
              tooltipRight
              aria-label={`${t("marks.delete")} ${name}`}
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
