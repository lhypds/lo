import { useEffect, useRef } from "react";
import styles from "./modal.module.css";

// The sheets that are open, innermost last. Sheets stack — a profile opens over
// a conversation and closes back onto it — so the page underneath has to stay
// locked until the last of them has gone, rather than being handed its scroll
// back by the one on top while another is still over it.
//
// A list rather than the count that used to be here, because Escape asks the
// other question about the same pile: not how many are open but which one is on
// top. The count is its length; the sheet Escape belongs to is its end.
const sheets = [];

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
  // Read at the moment Escape is pressed rather than closed over when the sheet
  // opened: a sheet that spends part of its life refusing to close says so by
  // withholding onClose, and the composer does exactly that while it uploads.
  const close = useRef(onClose);
  close.current = onClose;

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
    // What Escape does to a sheet everywhere else, and the way out for anyone
    // whose hands are already on the keyboard — the close button is the only
    // other one, and it is a small cross in a far corner.
    //
    // Only the sheet on top hears it, so Escape over a profile opened from a
    // conversation gives the conversation back rather than clearing the pile.
    // And one press is not this sheet's to take at all: the one an input method
    // is still holding, which is a reader dismissing a candidate list — every
    // language here but English types through one, and the browser sends the
    // keydown anyway, so without this they lose the sheet along with the list.
    //
    // Listening on the document, below React's own root, is what leaves the
    // press to anything inside the sheet that has a better answer for it: a
    // field that empties itself first stops the event there and never reaches
    // this, the way the search field already does out on the pages.
    const sheet = {};
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (event.isComposing || event.keyCode === 229) return;
      if (sheets[sheets.length - 1] !== sheet) return;
      if (!close.current) return;
      event.stopPropagation();
      close.current();
    };

    sheets.push(sheet);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("keydown", handleKeyDown);
      sheets.splice(sheets.indexOf(sheet), 1);
      if (sheets.length > 0) return;
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
