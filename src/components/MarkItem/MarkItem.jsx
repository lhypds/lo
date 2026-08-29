import { useTranslation } from "react-i18next";
import { distanceMeters, formatCoords, formatDateTime, formatDistance } from "../../utils/format.js";
import { hoverProps, rowClass } from "../../utils/hover.js";
import { directionsLink, searchLink } from "../../utils/maps.js";
import { labelName } from "../../utils/label.js";

// The four things that can be done with a spot, on a line of their own under it
// — the same four words, in the same two groups, that the spot's own bubble
// carries up on the map (see markPopupElement in MapCard). The row and the pin
// are one mark, and a reader who has learned the bubble should not have to learn
// a second set of controls to work the list underneath it.
//
// Words rather than the icons that were here before. Four glyphs in a corner is
// a row asking to be decoded — a pencil for renaming and a magnifier for looking
// the place up are both guesses, and the tooltip that settled them is not
// something a phone has. The words cost the line they stand on and nothing else:
// they are the small print's own size, and the row is no longer wearing three
// buttons in the space the name wanted.
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
          <strong className={named ? undefined : "mark-numbers"}>{name}</strong>
          {named && <span className="mark-coords">{coords}</span>}
          <time dateTime={mark.time}>{formatDateTime(mark.time, i18n.language)}</time>
        </button>
        {away && <span className="mark-distance">{t("marks.distance", { distance: away })}</span>}
      </div>
      {/* The two that leave lo for somewhere else, and then the two that are
          about the mark itself. Apart at the two ends of the line, so a press
          meant for one kind is not a press made by accident on the other — and
          delete on the outside of its own pair, furthest from the words the
          reader means to press often. The bubble's own arrangement, because it
          is the same four things. */}
      <div className="mark-actions">
        <span className="mark-action-group">
          {/* What is standing there, which is a question a spot kept before
              anyone knew the answer often still has. A name searches for that
              name on this ground; an unnamed spot falls back to its coordinates. */}
          <a
            className="mark-action"
            aria-label={`${t("map.search")} ${name}`}
            {...searchLink(mark, named)}
          >
            {t("map.search")}
          </a>
          {/* Turn-by-turn is a thing a phone in a pocket does well and a card on
              a dashboard does badly, so this hands the spot to Google Maps — the
              app on a handheld, the directions page on a desktop — rather than
              drawing a line lo cannot then follow. */}
          <a
            className="mark-action"
            aria-label={`${t("map.nav")} ${name}`}
            {...directionsLink(mark, from)}
          >
            {t("map.nav")}
          </a>
        </span>
        <span className="mark-action-group">
          <button
            type="button"
            className="mark-action"
            aria-label={`${t("map.edit")} ${name}`}
            onClick={() => onRename(mark)}
          >
            {t("map.edit")}
          </button>
          <button
            type="button"
            className="mark-action"
            aria-label={`${t("map.delete")} ${name}`}
            onClick={() => onDelete(mark)}
          >
            {t("map.delete")}
          </button>
        </span>
      </div>
    </li>
  );
}
