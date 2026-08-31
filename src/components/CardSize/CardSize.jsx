import { useTranslation } from "react-i18next";
import { ActionButton } from "../../ui/index.js";
import { cardSizes, removeCard, resizeCard, useCardSize } from "../../utils/cards.js";
import styles from "./size.module.css";

// The buttons at the right of a card's heading: a minus, on every card there is,
// and a plus in front of it on the ones with any growing to do.
//
// The minus is the one that is always there, because it always has an answer.
// Above the bottom rung it is less room: one step at a time back down the card's
// own ladder rather than a jump to either end (see cardSizes in utils/cards.js) —
// every panel that holds a list has four rungs, a square to two to four to six,
// and a button that jumped would put the middle ones out of reach. At the bottom
// rung — a single square, which is where every card arrives and where the ones
// that never resize stay — it is what asking for less than one square means: the
// card comes off the page (see removeCard in utils/cards.js). So it is drawn in
// full ink from top to bottom, and a card is put away by pressing it down to
// nothing rather than by hunting for its row in the plus menu. Nothing is lost by
// a mis-hit: that row is where the card goes, still holding everything the reader
// decided about it.
//
// The plus is spent at the top of the ladder rather than hidden, because a
// control that comes and goes moves the other one under the reader's finger, and
// a spent button still says what the panel is doing: disabled plus, this is as
// big as it goes. A card with one rung is not that and is not drawn that way: the
// clock, the sky, the ground, the bearing, the wireless, what is in force and who
// is near are faces rather than windows and have no ladder at all, so what stands
// in their headings is the minus alone. A plus that could never be pressed on any
// day is not a spent control, it is a dead one, and seven of them across the
// opening block of squares would be the loudest thing on the page.
//
// Whose card it is comes in as an id rather than a callback: the size lives in
// the layout the whole dashboard is drawn from (see utils/cards.js), so a press
// here is a decision about the page and not a piece of state the card above it
// has to hold and remember.
export default function CardSize({ id }) {
  const { t } = useTranslation();
  const size = useCardSize(id);
  const sizes = cardSizes(id);
  const rung = sizes.indexOf(size);
  const bigger = sizes[rung + 1];
  const smaller = sizes[rung - 1];

  return (
    <span className={styles.pair}>
      {sizes.length > 1 && (
        <ActionButton
          tooltip={t("cards.bigger")}
          disabled={!bigger}
          onClick={() => resizeCard(id, bigger)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </ActionButton>
      )}
      {/* The last thing on the row, so its tooltip is anchored to its own right
          edge and grows back across the heading — centred, the box would hang
          off the side of the card. */}
      <ActionButton
        tooltip={smaller ? t("cards.smaller") : t("cards.remove")}
        tooltipRight
        onClick={() => (smaller ? resizeCard(id, smaller) : removeCard(id))}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </ActionButton>
    </span>
  );
}
