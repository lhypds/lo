import { useEffect, useRef, useState } from "react";
import { Modal } from "../../ui/index.js";

// Naming a mark. The field starts on whatever it is called now, and an empty
// value is allowed — a spot may simply not need a name.
//
// No placeholder in the box: the sheet's own title says what is being typed, and
// a grey copy of it inside the field said it a second time on a sheet that is
// one line tall. The empty field is the answer to "what is it called" — there is
// nothing to prompt for.
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
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setValue(initialValue);
    setError("");
    setSubmitting(false);
    // The keyboard should already be up on a phone by the time the sheet lands.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [isOpen, initialValue]);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(value.trim().normalize("NFKC"));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} title={title} onClose={onClose} closeOnOverlay>
      <form className="plain-form" onSubmit={submit} autoComplete="off">
        <label>
          <input
            ref={inputRef}
            className="mark-field"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
            }}
            maxLength={48}
            enterKeyHint="done"
            autoComplete="off"
          />
        </label>
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
