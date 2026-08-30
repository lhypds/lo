import { useEffect, useId, useRef, useState } from "react";
import styles from "./select.module.css";

// The house dropdown, and the reason there is one: a <select> takes any styling
// asked of it as far as the edge of its closed box and no further. What opens out
// of it is the operating system's menu — the system's type, the system's rounded
// sheet, the system's blue bar across one row — dropped onto an app that has no
// rounding, no blue and one ink. The closed box was already lo's, drawn back to a
// hairline square with appearance: none; this is the other half of the same job.
//
// A button and a list, which is what the native control is underneath. Written to
// the listbox pattern rather than invented: the roles are what tell a reader who
// is listening that this is the same thing everybody else is looking at, and the
// keys are the ones their fingers already know — the arrows walk the rows, Enter
// takes the one under them, Escape leaves the answer as it was found.
//
// `options` are { value, label } and nothing else. What a menu is a menu of is
// the caller's business (see LINK_KINDS in utils/links.js, which is where the
// profile form's list comes from); this only knows how to show a list of names
// and hand one back.

// How far the list is allowed to run before it scrolls, and the air it keeps from
// the edge of the window. The first is about eight rows — enough of a list to be
// read as one, and short enough to leave the sheet behind it in view.
const MENU_MAX_H = 232;
const EDGE = 8;

export default function Select({ options, value, onChange, label, className }) {
  const [open, setOpen] = useState(false);
  // Which row the keys are on while the list is up. Not the answer — the answer
  // is `value`, and it does not change until a row is actually taken — but the
  // row Enter would take, which is where a native menu opens its own highlight.
  const [active, setActive] = useState(-1);
  // Where the menu is put. Measured rather than laid out, because it is fixed to
  // the window: see the note on .menu in the stylesheet for why it cannot simply
  // hang off the box above it.
  const [box, setBox] = useState(null);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const at = options.findIndex((option) => option.value === value);
  // A value the list has no row for is still shown as itself — the caller may be
  // holding something this build has no name for, and a box that showed nothing
  // would read as a menu nobody had answered yet.
  const shown = at === -1 ? value : options[at].label;

  // Where the list stands, from where the box stands. Answered fresh every time
  // rather than remembered: between one opening and the next the sheet may have
  // scrolled, the window may have been resized, and a row above this one may have
  // been taken off the form.
  function place() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - EDGE;
    const above = rect.top - EDGE;
    // Downwards unless the room is plainly upstairs. A menu that opens over the
    // box it belongs to is harder to follow, so it only does so where opening the
    // other way would leave it a row or two tall.
    const up = below < Math.min(MENU_MAX_H, above);
    setBox({
      left: rect.left,
      // At least as wide as the box it came out of, and wider where a name asks
      // for it: the closed box is cut to the row it stands in, and the menu is
      // not standing in that row.
      minWidth: rect.width,
      top: up ? undefined : rect.bottom - 1,
      bottom: up ? window.innerHeight - rect.top - 1 : undefined,
      maxHeight: Math.min(MENU_MAX_H, up ? above : below),
    });
  }

  // Opened on the row that is already the answer, which is where the native menu
  // opens too: the first arrow press then moves from what is set rather than from
  // the top of a list somebody has to find their place in again.
  function show(from = at === -1 ? 0 : at) {
    place();
    setActive(from);
    setOpen(true);
  }

  function hide({ toTrigger = true } = {}) {
    setOpen(false);
    if (toTrigger) triggerRef.current?.focus();
  }

  function take(index) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    hide();
  }

  // The list takes the focus as it arrives, so the arrows are already its own —
  // and hands it back to the box on the way out, wherever the way out was.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    // The box moves whenever anything under it scrolls or the window changes
    // shape, and a menu fixed to the window does not follow of its own accord.
    // Captured on the way down, so the sheet's own scroller is heard as well as
    // the page's — a scroll inside a box does not bubble.
    const follow = () => place();
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    // A press anywhere else is the reader saying they are done with the list.
    // Down rather than up, so a press that lands on something behind the menu
    // closes it before that something is pressed.
    //
    // Caught on the way down, which is the whole of why this works at all: every
    // menu in lo opens inside a sheet, and a sheet stops all four pointer events
    // dead at its overlay so that a drag inside one is not read as a page turn by
    // the strip underneath (see the gestures in ui/Modal). React's handlers run
    // at the root, so that stop is a stop on the native event too — a listener
    // bubbling up to the document never hears a press made anywhere inside a
    // sheet, which is everywhere this control is used. On the way down it is
    // heard before the overlay has the chance. The same reason ImportHelp and
    // DeleteAllMarks take theirs in capture.
    function outside(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [open]);

  // The row the arrows are on is kept in view by hand: the list is a scroller and
  // the highlight can be walked past either end of what is showing.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function step(by) {
    setActive((current) => {
      const next = current + by;
      // Stops at the ends rather than wrapping, which is what a native menu does:
      // a list that comes back round has no bottom to arrive at.
      return Math.max(0, Math.min(options.length - 1, next));
    });
  }

  function onTriggerKey(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === " ") {
      // Space and the arrows would scroll the sheet behind the menu otherwise
      event.preventDefault();
      show();
    }
  }

  function onListKey(event) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        take(active);
        break;
      case "Escape":
        event.preventDefault();
        hide();
        break;
      case "Tab":
        // Let the tab through — it is the reader leaving this control, not
        // choosing from it — but the list must not be what they leave from.
        hide();
        break;
      default:
        break;
    }
  }

  return (
    <div ref={wrapperRef} className={`${styles.wrapper}${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger}${open ? ` ${styles.open}` : ""}`}
        // The listbox pattern's own three: what this opens, whether it is open,
        // and — while it is — which row the keys are on.
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onTriggerKey}
      >
        <span className={styles.value}>
          {/* Not read, only measured — see .sizer in the stylesheet */}
          <span className={styles.sizer} aria-hidden="true">
            {options.map((option) => (
              <span key={option.value}>{option.label}</span>
            ))}
          </span>
          <span className={styles.shown}>{shown}</span>
        </span>
        <svg className={styles.chevron} viewBox="0 0 12 8" aria-hidden="true">
          <path d="M1 1l5 5 5-5" />
        </svg>
      </button>

      {open && box && (
        <ul
          ref={listRef}
          id={listId}
          className={styles.menu}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
          style={box}
          onKeyDown={onListKey}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={[styles.option, index === active ? styles.active : "", option.value === value ? styles.chosen : ""]
                .filter(Boolean)
                .join(" ")}
              // The pointer moves the highlight rather than drawing a second one
              // of its own, so there is one row marked at a time however the
              // reader is working — see .active in the stylesheet.
              onPointerEnter={() => setActive(index)}
              // A completed click rather than pointerdown: on touch, the first
              // contact may become a drag through this scrollable list. Taking
              // the row before that gesture is known would prevent the scroll.
              onClick={() => take(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
