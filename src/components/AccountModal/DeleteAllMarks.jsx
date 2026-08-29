import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { showToast } from "../../ui/index.js";
import styles from "./account.module.css";

// The word that has to be typed. Held here rather than in the phrasebook, and
// the same word in every language, because it is not being read — it is
// being copied. A confirmation whose word changes with the interface is one a
// reader has to translate before they can retype it, which is friction spent on
// the wrong half of the act: the pause is the point, the puzzle is not.
//
// Lower case, and what is typed is folded to it before the two are compared. A
// phone that capitalises the first letter of a field is not a reader who meant
// something else.
const CONFIRM_WORD = "delete";

// The second verb in the brackets after the count, and the one that cannot be
// taken back.
//
// Every other control on this sheet is either reversible (the discoverable
// switch, the profile) or additive (the import, which overwrites nothing). This
// one is neither, and it is sitting two words away from a control that runs on a
// single press. So it does not run on one: pressing the word opens a panel, and
// what is in the panel is the count it is about and a field that has to be filled
// in before the button under it will do anything.
//
// Typed rather than a second press, because a second press is the same gesture as
// the first and a reader already moving through this sheet can spend two of them
// as easily as one. Typing a word is the one confirmation that cannot be
// performed by momentum.
//
// Hung under the row in the same panel the note beside it uses (see ImportHelp),
// for the same reason: this is about one line of the record, and a sheet over the
// account would make undoing a bad import look like somewhere the reader has gone.
export default function DeleteAllMarks({ count, onCleared }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const fieldRef = useRef(null);

  // Opened straight into the field, since the field is the whole of what the
  // panel is asking for and reaching it is a press the reader has no reason to
  // spend.
  useEffect(() => {
    if (open) fieldRef.current?.focus();
  }, [open]);

  // Closed the same two ways the note beside it closes, and in the capture phase
  // for the same two reasons — the sheet's overlay swallows presses on their way
  // up, and the sheet is listening for Escape and would close the whole account
  // over a reader who only wanted this put away. See ImportHelp, which explains
  // both at length.
  //
  // Not while the request is out. A panel that vanished mid-delete would leave
  // the reader watching a count they have no reason to trust yet.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (deleting) return;
      setOpen(false);
      setTyped("");
    };
    const handleOutside = (event) => {
      if (buttonRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      close();
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (event.isComposing || event.keyCode === 229) return;
      event.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", handleOutside, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutside, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, deleting]);

  const armed = typed.trim().toLowerCase() === CONFIRM_WORD;

  async function submit(event) {
    event.preventDefault();
    if (!armed || deleting) return;
    setDeleting(true);
    try {
      const { removed } = await api.clearMarks();
      setOpen(false);
      setTyped("");
      onCleared(removed);
      showToast(t("account.deletedAll", { count: removed }));
    } catch (error) {
      showToast(error.message || t("account.deleteAllFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Set as the word beside it is set, in the same ink and with the same
          underline. Not reddened or otherwise marked out: lo is written in one
          colour, and what makes this safe is the panel it opens rather than the
          shade it is printed in.

          Live over an empty list too, and in the same ink. A word greyed out is
          a reader being refused without being told why, over a line where the
          refusal is the least interesting thing there is to say; the panel can
          say it in a sentence, which is what it does. */}
      <button
        ref={buttonRef}
        type="button"
        className={styles.action}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t("account.deleteAll")}
      </button>

      {/* Nothing to ask about, so nothing is asked: the panel opens on the one
          line that answers the press and carries neither the field nor the
          button. Its shape is the answer — a reader who sees no way to go on
          has read the sentence before reading it. */}
      {open && count === 0 && (
        <div ref={panelRef} className={styles.tip}>
          <p className={styles.tipLine}>{t("account.deleteAllNone")}</p>
        </div>
      )}

      {open && count > 0 && (
        <form ref={panelRef} className={styles.tip} onSubmit={submit}>
          {/* The count said back, because it is what the reader is about to
              agree to and the figure two lines above is not the same claim: one
              is a reading and this is a number of things that will stop
              existing. */}
          <p className={styles.tipLine}>{t("account.deleteAllIntro", { count })}</p>
          <p className={styles.note}>{t("account.deleteAllNote")}</p>
          <label className={styles.confirm}>
            <span>{t("account.deleteAllAsk", { word: CONFIRM_WORD })}</span>
            {/* Every helper the browser would otherwise bring turned off. A
                confirmation the keyboard can complete is not one. */}
            <input
              ref={fieldRef}
              className={styles.confirmField}
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={deleting}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          {/* Dead until the word is right, which is the whole of the guard: the
              button is present from the moment the panel opens, so what the
              reader has to do to reach it is plain, and it cannot be reached any
              other way. Set in the corner the note's own press is set in. */}
          <button type="submit" className={styles.download} disabled={!armed || deleting}>
            {deleting ? t("account.deletingAll") : t("account.deleteAllDo")}
          </button>
        </form>
      )}
    </>
  );
}
