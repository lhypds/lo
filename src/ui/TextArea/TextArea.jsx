import { useRef, forwardRef } from "react";
import styles from "./textarea.module.css";

// The house textarea, the same one liveboard and stash ship: the browser's own
// corner grip is off, and the field is resized by the ruled handle in the
// bottom right instead — one gesture, drawn the way everything else here is.
const TextArea = forwardRef(function TextArea({ className, minHeight = 80, style, ...props }, forwardedRef) {
  const localRef = useRef(null);

  function setRefs(el) {
    localRef.current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  }

  // A pointer rather than a mouse. This was mousedown/mousemove/mouseup, which is
  // a gesture no touchscreen makes: a finger raises a click and a synthesised
  // mousedown *after* it is lifted, and never a stream of mousemove in between —
  // so the handle drew a grip on a phone that nothing could drag. Pointer events
  // are the one code path all three devices arrive on, and the phone is the one
  // that needs the handle most, since it has no native grip to fall back on.
  function startResize(event) {
    // Keeps the press off the textarea underneath: the drag is a resize, not a
    // reach for the caret or the start of a selection.
    event.preventDefault();
    const handle = event.currentTarget;
    // The gesture belongs to this element from here on, wherever the finger
    // wanders — off the handle, past the edge of the sheet — which is what lets
    // the listeners live on the handle rather than on the document, and what
    // guarantees the one pointerup that ends it arrives here.
    handle.setPointerCapture(event.pointerId);

    // Where the grab landed relative to the field's bottom edge, so the height
    // follows the pointer from where it is rather than snapping the edge up to
    // it on the first move — that snap is the jump the drag used to open with.
    const grabOffset = event.clientY - localRef.current.getBoundingClientRect().bottom;

    function onMove(moveEvent) {
      // A second finger on the screen is its own pointer and has nothing to do
      // with this drag.
      if (moveEvent.pointerId !== event.pointerId) return;
      // Measure the live top on every move rather than anchoring to the
      // position at the start: growing the textarea can grow its container
      // (e.g. a vertically-centered modal re-centers as it grows taller),
      // shifting the textarea's top out from under a fixed anchor and
      // decoupling the handle from the pointer.
      const top = localRef.current.getBoundingClientRect().top;
      localRef.current.style.height = Math.max(minHeight, moveEvent.clientY - top - grabOffset) + "px";
    }

    // Cancel as well as up: the browser takes a touch pointer away the moment it
    // decides the gesture is something of its own, and a drag that ended that way
    // would otherwise leave the listeners on.
    function onEnd(endEvent) {
      if (endEvent.pointerId !== event.pointerId) return;
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  }

  return (
    <div className={styles.wrapper}>
      {/* The floor is a CSS min-height as well as the cap on the drag, so the
          field opens at that height rather than at whatever `rows` works out to
          — otherwise the first drag jumps it up to the floor it should have
          started on. */}
      <textarea
        ref={setRefs}
        className={`${styles.textarea}${className ? ` ${className}` : ""}`}
        style={{ minHeight, ...style }}
        {...props}
      />
      <div className={styles.handle} onPointerDown={startResize} />
    </div>
  );
});

export default TextArea;
