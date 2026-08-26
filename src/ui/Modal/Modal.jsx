import { useEffect, useRef } from "react";
import styles from "./modal.module.css";

// Below this much of the window missing, whatever has taken the space is the
// keyboard rather than a browser's own chrome sliding in or out.
const KEYBOARD_MIN = 120;

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

  // A phone's keyboard does not take its room out of the window: on iOS it
  // slides up over the page, `innerHeight` never moves, and the browser scrolls
  // what it calls the visual viewport to keep the focused field in sight. A
  // full-screen sheet is fixed to the window, so what that scroll carries off
  // the top of the screen is the sheet's own header — the way back and the ✕,
  // the two things somebody typing is most likely to want next.
  //
  // So while such a sheet is open it is measured against that visual viewport
  // rather than the window: as tall as the part of the screen that can actually
  // be seen, and moved down to wherever the browser has scrolled that part to.
  // The header stays at the top of it, the composer sits on the keyboard, and
  // the browser has nothing left to scroll out of the way. Written as custom
  // properties rather than as height and top, so the desktop rules — which are
  // outside the phone's media query and want none of this — are not overwritten
  // by an inline style they cannot answer.
  //
  // The home bar's inset goes while the keyboard is up: it is there to keep the
  // composer off a bar that the keyboard is now covering, and left in it would
  // read as a gap between the two.
  const boxRef = useRef(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!isOpen || !full || !viewport) return undefined;
    const box = boxRef.current;
    if (!box) return undefined;
    const sync = () => {
      box.style.setProperty("--sheet-height", `${viewport.height}px`);
      box.style.setProperty("--sheet-top", `${viewport.offsetTop}px`);
      const keyboard = window.innerHeight - viewport.height > KEYBOARD_MIN;
      if (keyboard) box.style.setProperty("--sheet-foot", "0px");
      else box.style.removeProperty("--sheet-foot");
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, [isOpen, full]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (closeOnOverlay && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={boxRef}
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
