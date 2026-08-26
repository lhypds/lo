import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCards } from "../../utils/cards.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./add.module.css";

// The dashboard's own contents page: a plus in the top bar, and under it every
// card this place can be asked about, with the ones already on the grid marked.
// A press turns one on or off — the same press either way, because a list of the
// page's cards is a list of things that are each already on it or not, and a
// menu that only added would need a second way of taking something back off.
//
// It stays open through a press for that reason as well: putting the news on and
// the trending list away is one visit to the same short list.
export default function AddCard() {
  const { t } = useTranslation();
  const { supports } = useHere();
  const { cards, toggle } = useCards(supports);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, []);

  return (
    <div ref={wrapperRef} className={styles.wrapper} data-open={open}>
      {/* Not an ActionButton, for the one reason the language switcher beside it
          is not either: those carry their tooltip in a box hung under the button,
          which is exactly where this list opens. The label is the name of the
          thing for a screen reader instead. */}
      <button
        type="button"
        className={styles.trigger}
        aria-label={t("header.cards")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
      <div className={styles.dropdown}>
        {cards.map(({ id, label, on }) => (
          <button
            key={id}
            type="button"
            className={on ? `${styles.option} ${styles.on}` : styles.option}
            aria-pressed={on}
            onClick={() => toggle(id)}
          >
            {t(label)}
          </button>
        ))}
      </div>
    </div>
  );
}
