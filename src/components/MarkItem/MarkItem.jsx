import { useTranslation } from "react-i18next";
import { ActionButton } from "../../ui/index.js";
import { distanceMeters, formatCoords, formatDateTime, formatDistance } from "../../utils/format.js";

export default function MarkItem({ mark, from, onRename, onDelete, onShowOnMap }) {
  const { t, i18n } = useTranslation();
  const name = mark.label || mark.place || t("marks.unnamed");
  const away = from ? formatDistance(distanceMeters(from, mark)) : "";

  return (
    <li className="mark-item">
      <div className="mark-row">
        <div className="mark-copy">
          <strong>{name}</strong>
          <span className="mark-coords">{formatCoords(mark.latitude, mark.longitude)}</span>
          <time dateTime={mark.time}>{formatDateTime(mark.time, i18n.language)}</time>
        </div>
        <div className="mark-side">
          {away && <span className="mark-distance">{t("marks.distance", { distance: away })}</span>}
          <span className="mark-actions">
            <ActionButton tooltip={t("marks.showOnMap")} onClick={() => onShowOnMap(mark)}>
              <svg viewBox="0 0 24 24">
                <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
            </ActionButton>
            <ActionButton tooltip={t("marks.rename")} onClick={() => onRename(mark)}>
              <svg viewBox="0 0 24 24">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </ActionButton>
            <ActionButton tooltip={t("marks.delete")} onClick={() => onDelete(mark)}>
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
