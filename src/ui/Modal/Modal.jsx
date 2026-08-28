import { useEffect } from "react";
import styles from "./modal.module.css";

// How many sheets are open at once. Sheets stack — a profile opens over a
// conversation and closes back onto it — so the page underneath has to stay
// locked until the last of them has gone. Counted rather than set and unset,
// because the one on top closing would otherwise hand the scroll back to a page
// that is still behind an open sheet.
let openSheets = 0;

// A sheet is over the page, not part of it, and the page should never hear about
// a gesture made inside one.
//
// It hears about them by default, and the reason is easy to miss: React sends an
// event from a portal up the *React* tree rather than the DOM one, so a drag
// inside a sheet is delivered to whatever rendered it — which on this dashboard
// is a card, inside the strip that turns the page when it is dragged sideways.
// Left alone, selecting a sentence in a sheet turned the page underneath it and
// selected nothing: the strip read the drag as a swipe and took the gesture for
// itself, preventing the default that would have drawn the selection.
//
// Every one the strip listens for is stopped here, at the overlay, which is
// after everything inside the sheet has had it and before anything outside does.
const swallow = (event) => event.stopPropagation();
const gestures = {
  onPointerDown: swallow,
  onPointerMove: swallow,
  onPointerUp: swallow,
  onPointerCancel: swallow,
  onTouchStart: swallow,
  onTouchMove: swallow,
  onTouchEnd: swallow,
  onTouchCancel: swallow,
  // The strip refuses both of these over the dashboard — a sideways drag there
  // is only ever a page turn, and a hold is a card being picked up. In a sheet
  // they are a reader dragging a link and asking for a menu, and both are theirs
  // to have.
  onDragStart: swallow,
  onContextMenu: swallow,
};

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  closeOnOverlay = false,
  wide = false,
  large = false,
  header,
  className,
}) => {
  // Prevent touchmove on background
  // allow scroll on textarea/input/select but prevent on the rest of the background
  useEffect(() => {
    if (!isOpen) return;
    const isScrollable = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight;
    };
    const allowTags = ["TEXTAREA", "INPUT", "SELECT"];
    const handleTouchMove = (e) => {
      let el = e.target;
      while (el && el !== document.body) {
        if (allowTags.includes(el.tagName) || isScrollable(el)) {
          return; // allow scroll/touchmove on scrollable elements
        }
        el = el.parentElement;
      }
      e.preventDefault(); // prevent background scroll
    };
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    openSheets += 1;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      openSheets -= 1;
      if (openSheets > 0) return;
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (closeOnOverlay && e.target === e.currentTarget) {
      onClose();
    }
  };

  const box = [styles.modal, wide ? styles.wide : "", large ? styles.large : "", className];
  return (
    <div className={styles.overlay} onClick={handleOverlayClick} {...gestures}>
      <div className={box.filter(Boolean).join(" ")}>
        <div className={styles.header}>
          {title && <span className={styles.title}>{title}</span>}
          {/* Whatever else belongs on the top bar of this particular sheet —
              the way through to the original, on the one that frames a page. It
              sits between the title and the close, which is where a reader
              looks for it and where it cannot be mistaken for the content. */}
          {header}
          <button className={styles.closeButton} onClick={onClose} disabled={!onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
