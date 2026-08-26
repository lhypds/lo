import { useTranslation } from "react-i18next";
import { ActionButton } from "../../ui/index.js";
import { LARGE, SMALL, resizeCard, useCardSize } from "../../utils/cards.js";
import styles from "./size.module.css";

// The pair of buttons at the right of a panel's heading: a plus that gives it
// the room of four squares and a minus that hands two of them back. Two sizes
// and no more, so at either end one of the two buttons is spent — shown rather
// than hidden, because a control that comes and goes moves the other one under
// the reader's finger, and a spent button still says what the panel is doing:
// disabled plus, this is as tall as it goes.
//
// Whose panel it is comes in as an id rather than a callback: the size lives in
// the layout the whole dashboard is drawn from (see utils/cards.js), so a press
// here is a decision about the page and not a piece of state the panel above it
// has to hold and remember.
export default function CardSize({ id }) {
  const { t } = useTranslation();
  const size = useCardSize(id);

  return (
    <span className={styles.pair}>
      <ActionButton
        tooltip={t("cards.bigger")}
        disabled={size === LARGE}
        onClick={() => resizeCard(id, LARGE)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </ActionButton>
      {/* The last thing on the row, so its tooltip is anchored to its own right
          edge and grows back across the heading — centred, the box would hang
          off the side of the card. */}
      <ActionButton
        tooltip={t("cards.smaller")}
        tooltipRight
        disabled={size === SMALL}
        onClick={() => resizeCard(id, SMALL)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </ActionButton>
    </span>
  );
}
