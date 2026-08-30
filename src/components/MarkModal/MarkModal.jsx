import { useEffect, useRef, useState } from "react";
import { Modal, TextArea } from "../../ui/index.js";

// Naming a mark. The field starts on whatever it is called now, and an empty
// value is allowed — a spot may simply not need a name.
//
// No placeholder in the box: the sheet's own title says what is being typed, and
// a grey copy of it inside the field said it a second time on a sheet with one
// box in it. The empty field is the answer to "what is it called" — there is
// nothing to prompt for.
//
// The box is the house textarea rather than a single line, so a name that runs
// long can be opened out and read whole by the ruled handle in its corner. It is
// still a name and not a passage, which is why Enter answers the sheet the way
// it did when this was an input, and why what comes out is folded back onto one
// line whatever was dragged open to type it.
//
// `discardLabel` is for the sheet where closing costs something. On a spot that
// is not on the server yet, Save is what keeps it and every other way out throws
// it away; the sheet says which is which rather than leaving the reader to find
// out. A rename passes no label and gets no second button — the spot is already
// kept, and closing changes nothing.
export default function MarkModal({ isOpen, title, submitLabel, discardLabel, initialValue = "", onClose, onSubmit }) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fieldRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setValue(initialValue);
    setError("");
    setSubmitting(false);
    // The keyboard should already be up on a phone by the time the sheet lands.
    const timer = window.setTimeout(() => fieldRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [isOpen, initialValue]);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      // Folded onto one line before it goes: the box can be dragged to two or
      // ten, but a name is read back on a row in a list and on a pin over a map,
      // where a return is not a line break so much as a hole in the word.
      // Normalised first, so that the wide space CJK keyboards type is a space
      // by the time the fold looks for one.
      await onSubmit(value.normalize("NFKC").replace(/\s+/g, " ").trim());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} title={title} onClose={onClose} closeOnOverlay>
      <form className="plain-form" onSubmit={submit} autoComplete="off">
        {/* No label element over it, and none wrapped around it: the sheet's
            title is the whole of what there is to say about this box, so the
            field borrows it by name instead of the sheet saying it twice. */}
        <TextArea
          ref={fieldRef}
          className="mark-field"
          aria-label={title}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          // Enter answers the sheet; Shift+Enter opens a line, which the fold on
          // the way out closes again. A return that only picks a candidate out
          // of an IME's list (CJK input) is left to the IME.
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              submit(event);
            }
          }}
          maxLength={48}
          rows={2}
          minHeight={60}
          enterKeyHint="done"
          autoComplete="off"
          disabled={submitting}
        />
        {error && <p className="form-message error">{error}</p>}
        {/* The answers at the foot of the sheet, in the order every other confirm
            in lo puts them: the one that keeps something on the right, where the
            eye leaves the line, and the one that does not beside it. */}
        <div className="modal-actions">
          {discardLabel && (
            <button type="button" className="outline-button" onClick={onClose} disabled={submitting}>
              {discardLabel}
            </button>
          )}
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
