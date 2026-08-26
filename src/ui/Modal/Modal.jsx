import { useEffect } from "react";
import styles from "./modal.module.css";

// How many sheets are open at once. Sheets stack — a profile opens over a
// conversation and closes back onto it — so the page underneath has to stay
// locked until the last of them has gone. Counted rather than set and unset,
// because the one on top closing would otherwise hand the scroll back to a page
// that is still behind an open sheet.
let openSheets = 0;

// `full` is for a sheet that is stayed in rather than glanced at — on a phone it
// stops pretending to be a card over the page and takes the whole window. It is
// a phone rule only: on a desktop the window is not the sheet's size, and a
// conversation blown up to fill one reads as having lost the page behind it.
const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  closeOnOverlay = false,
  wide = false,
  full = false,
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

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        className={[styles.modal, wide ? styles.wide : "", full ? styles.full : "", className]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.header}>
          {title && <span className={styles.title}>{title}</span>}
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
