import { useEffect, useRef, useState } from "react";
import { Modal } from "../../ui/index.js";

// Naming a mark after the fact. The field starts on whatever it is called now,
// and an empty value is allowed — a spot may simply not need a name.
//
// No placeholder in the box: the sheet's own title says what is being typed, and
// a grey copy of it inside the field said it a second time on a sheet that is
// one line tall. The empty field is the answer to "what is it called" — there is
// nothing to prompt for.
export default function MarkModal({ isOpen, title, submitLabel, initialValue = "", onClose, onSubmit }) {
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
          <div className="joined-field mark-field">
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
              maxLength={48}
              enterKeyHint="done"
              autoComplete="off"
            />
            <button type="submit" disabled={submitting}>
              {submitLabel}
            </button>
          </div>
        </label>
        {error && <p className="form-message error">{error}</p>}
      </form>
    </Modal>
  );
}
