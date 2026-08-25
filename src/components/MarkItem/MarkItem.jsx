import { useTranslation } from "react-i18next";
import { ActionButton } from "../../ui/index.js";
import {
  distanceMeters,
  formatCoords,
  formatDateTime,
  formatDistance,
  formatDuration,
} from "../../utils/format.js";

// Three actions, out on the row where they can be seen rather than behind a
// swipe nothing announces. The fourth — send the map here — is the name itself,
// so it costs no button and stays the easiest thing on the row to hit.
export default function MarkItem({
  mark,
  from,
  route = null,
  routing = false,
  onRename,
  onDelete,
  onNavigate,
  onShowOnMap,
}) {
  const { t, i18n } = useTranslation();

  const name = mark.label || mark.place || t("marks.unnamed");
  const away = from ? formatDistance(distanceMeters(from, mark)) : "";

  return (
    <li className="mark-item">
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
          {/* The route in words, under the row that asked for it: without this
              the only answer to "did that do anything" is a line on a map that
              may be scrolled off. */}
          {(route || routing) && (
            <span className="mark-route">
              {route
                ? `${t(`route.${route.profile}`)} · ${formatDistance(route.distance)} · ${formatDuration(route.duration)}`
                : t("route.finding")}
            </span>
          )}
        </button>
        <div className="mark-side">
          {away && <span className="mark-distance">{t("marks.distance", { distance: away })}</span>}
          <span className="mark-actions">
            {/* Pressed while its line is the one on the map, so the button that
                put it there is also the one that takes it off again. */}
            <ActionButton
              tooltip={t("marks.navigate")}
              aria-label={`${t("marks.navigate")} ${name}`}
              aria-pressed={Boolean(route)}
              onClick={() => onNavigate(mark)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M3 11 22 2l-9 19-2-8z" />
              </svg>
            </ActionButton>
            <ActionButton
              tooltip={t("marks.rename")}
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
