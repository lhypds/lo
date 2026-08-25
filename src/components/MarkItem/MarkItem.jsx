import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { distanceMeters, formatCoords, formatDateTime, formatDistance } from "../../utils/format.js";

// The row is one control — tap it and the map goes there — and the two actions
// that are not that live behind it, on the swipe tikt's knot rows use. Three
// buttons crowding the text was the old shape; a spot you kept is mostly there
// to be looked at, and renaming or deleting it is the rarer errand.
const ACTION_WIDTH = 56;
// The row stops short of the buttons rather than flush against them, so the
// drawer reads as something the row is sitting on top of.
const REVEAL_GUTTER = 12;
const REVEAL_WIDTH = ACTION_WIDTH * 2 + REVEAL_GUTTER;
// Under this a press is a tap. Past it, a drag with more vertical than
// horizontal in it belongs to the list's scroll and is left alone.
const DRAG_SLOP = 6;

export default function MarkItem({ mark, from, onRename, onDelete, onShowOnMap }) {
  const { t, i18n } = useTranslation();
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const dragRef = useRef(null);

  const name = mark.label || mark.place || t("marks.unnamed");
  const away = from ? formatDistance(distanceMeters(from, mark)) : "";
  const open = offset !== 0;

  function moveTo(nextOffset) {
    const next = Math.max(-REVEAL_WIDTH, Math.min(0, nextOffset));
    offsetRef.current = next;
    setOffset(next);
  }

  function startSwipe(event) {
    if (event.button !== 0) return;
    dragRef.current = {
      active: true,
      dragging: false,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offsetRef.current,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveSwipe(event) {
    const drag = dragRef.current;
    if (!drag?.active) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.dragging) {
      if (Math.abs(deltaX) < DRAG_SLOP) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
      drag.dragging = true;
    }
    moveTo(drag.startOffset + deltaX);
  }

  function finishSwipe() {
    const drag = dragRef.current;
    if (!drag?.active) return;
    drag.active = false;
    // Halfway is the commitment: past it the drawer stays open, short of it the
    // row goes back over the top of it.
    if (drag.dragging) {
      moveTo(offsetRef.current <= -REVEAL_WIDTH / 2 ? -REVEAL_WIDTH : 0);
      return;
    }
    // A tap with the drawer already open closes it. Nobody swipes a row open
    // and then means to send the map somewhere with the next touch.
    if (drag.startOffset !== 0) {
      moveTo(0);
      return;
    }
    onShowOnMap(mark);
  }

  function act(run) {
    moveTo(0);
    run(mark);
  }

  return (
    <li className="mark-item">
      {/* Hidden from the pointer until it is out, but never from the keyboard:
          focusing a button is what opens the drawer for anyone not swiping. */}
      <div className="mark-reveal" style={{ opacity: open ? 1 : 0 }}>
        <button
          type="button"
          className="mark-reveal-edit"
          aria-label={`${t("marks.rename")} ${name}`}
          onFocus={() => moveTo(-REVEAL_WIDTH)}
          onClick={() => act(onRename)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
        <button
          type="button"
          className="mark-reveal-delete"
          aria-label={`${t("marks.delete")} ${name}`}
          onFocus={() => moveTo(-REVEAL_WIDTH)}
          onClick={() => act(onDelete)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M9 7V5h6v2" />
            <path d="M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </div>
      <div
        className="mark-row"
        role="button"
        tabIndex={0}
        aria-label={`${t("marks.showOnMap")} ${name}`}
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        onPointerDown={startSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={finishSwipe}
        onPointerCancel={finishSwipe}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onShowOnMap(mark);
        }}
      >
        <div className="mark-copy">
          <strong>{name}</strong>
          <span className="mark-coords">{formatCoords(mark.latitude, mark.longitude)}</span>
          <time dateTime={mark.time}>{formatDateTime(mark.time, i18n.language)}</time>
        </div>
        {away && <span className="mark-distance">{t("marks.distance", { distance: away })}</span>}
      </div>
    </li>
  );
}
