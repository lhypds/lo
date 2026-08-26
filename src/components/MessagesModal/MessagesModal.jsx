import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../ui/index.js";
import { formatUsername } from "../../utils/format.js";
import Messages from "../Messages/index.js";
import { register } from "./messagesApi.js";
import styles from "./modal.module.css";

// The desktop's frame around a conversation: a sheet over whatever page the
// reader was on. Reading what somebody said to you is not somewhere you go on a
// screen this size — it is something you glance at and put down, with the
// dashboard still underneath and still the answer to where you are. It is also
// why there is no back arrow to work out afterwards: the ✕ puts you exactly
// where you were.
//
// A phone gets the page instead (see pages/MessagesPage) — there a sheet is the
// whole window with the page showing through its edges, which is a worse version
// of the page it is covering. Which of the two a press opens is decided in one
// place, by useOpenMessages in messagesApi; the bar only mounts this where it is
// the answer.
//
// Mounted once, by the top bar, and opened from anywhere through messagesApi —
// the envelope up there and "send a message" on a profile are the same gesture
// arriving from two places.
export default function MessagesModal() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // The name of the thread on screen, or nothing for the list of them. This is
  // the sheet's own state rather than a query on the URL: the sheet does not
  // change the page it is over, so the page's address should not change either.
  // The page frame is the other way round, and that is the whole difference
  // between them.
  const [to, setTo] = useState(null);

  useEffect(
    () =>
      register((username) => {
        setTo(username ?? null);
        setOpen(true);
      }),
    [],
  );

  return (
    <Modal
      isOpen={open}
      // In a thread the name is also the way back to the list, which is the only
      // place inside the sheet there is to go back to.
      title={
        to ? (
          <button type="button" className={styles.back} onClick={() => setTo(null)}>
            <span aria-hidden="true">‹</span> {formatUsername(to)}
          </button>
        ) : (
          t("messages.title")
        )
      }
      onClose={() => setOpen(false)}
      closeOnOverlay
      // The composer's own width, for the same reason it has it: this is a sheet
      // worked in rather than read off. Every row here is a name and a line of
      // somebody's writing on one line, and at the narrow size the line was the
      // half that got cut.
      wide
    >
      {/* The box the conversation is sized against. A definite height, so the
          composer sits at the foot of the sheet and the thread scrolls above it
          rather than pushing it off — and the same height for both views, so
          opening a conversation does not resize the sheet under the pointer that
          opened it. */}
      <div className={styles.box}>
        <Messages to={to} onOpen={setTo} />
      </div>
    </Modal>
  );
}
