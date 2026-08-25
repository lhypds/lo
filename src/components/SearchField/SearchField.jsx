import { useTranslation } from "react-i18next";
import styles from "./search.module.css";

// One line between a list and its heading, narrowing the list as it is typed.
// There is no button to press and nothing to submit: the answer is already in
// the browser, so waiting for a press would only be a ceremony.
//
// The same field over both lists — marks and posts are the same rows asking two
// questions, and searching them should not be two different gestures.
export default function SearchField({ value, onChange, placeholder }) {
  const { t } = useTranslation();

  return (
    <div className={styles.field}>
      <svg className={styles.glyph} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 4.5 4.5" />
      </svg>
      <input
        type="search"
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // The placeholder is the whole label: a heading sits directly above it
        // saying which list this is, and a second line of type saying it again
        // would be the loudest thing on a page of quiet rows.
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        // What Escape does in every search field there has ever been, and the
        // fastest way back to the whole list without reaching for the cross.
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.stopPropagation();
            onChange("");
          }
        }}
      />
      {/* Only there when there is something to clear — an empty field with a
          cross on it is a button that does nothing. */}
      {value && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onChange("")}
          aria-label={t("search.clear")}
        >
          ✕
        </button>
      )}
    </div>
  );
}
