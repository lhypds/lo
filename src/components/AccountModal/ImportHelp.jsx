import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadMarksPrompt } from "../../utils/marksPrompt.js";
import styles from "./account.module.css";

// The question mark inside the brackets, and the note it opens.
//
// The verb it stands beside says "import" and means one file: the marks.json lo
// itself hands out. That is a fine answer for a reader putting their own export
// back, and no answer at all for the reader this is for — somebody with years of
// places in Google Takeout, or a KML off a map app, looking at a picker that will
// refuse every one of them. The word cannot say what to do about that, and this
// is the only place lo has to say it.
//
// What it says is not "lo will convert your file", because lo will not: the way
// across is the reader's own AI, handed their export and the prompt this offers.
// Three steps, in the order they happen, and the prompt at the foot as the one
// thing to take away.
//
// Hung under the row rather than opened as a sheet of its own. A sheet over the
// account is the wrong size of thing twice over — it covers the record to explain
// one line of it, and it makes a digression look like somewhere the reader has
// gone. This is the same box the top bar's lists are (see export.module.css): a
// hairline panel under the line it belongs to, closed by looking away from it.
export default function ImportHelp() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const tipRef = useRef(null);

  // Both in the capture phase, and neither by accident.
  //
  // The press, because everything here happens inside a sheet, and the sheet's
  // overlay swallows every pointer event on its way up so that a drag inside it
  // never reaches the dashboard underneath (see ui/Modal). A listener waiting at
  // the document for the bubble would never hear a press in this sheet at all —
  // which is every press that could close this panel.
  //
  // Escape, because the sheet is listening for it too and would close the whole
  // account over a reader who only wanted this note gone. Caught on the way down
  // and stopped there, so the press is spent on the innermost thing that was
  // open, which is what Escape means everywhere else in lo.
  useEffect(() => {
    if (!open) return;
    const handleOutside = (event) => {
      if (buttonRef.current?.contains(event.target)) return;
      if (tipRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (event.isComposing || event.keyCode === 229) return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", handleOutside, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutside, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  return (
    <>
      {/* A circle rather than a word, because the line it sits on is already a
          sentence — a count, then a verb in brackets — and a second word inside
          those brackets would read as a second thing to do to the list. The
          label is what it is for, said out loud for anything that cannot see
          the glyph. */}
      <button
        ref={buttonRef}
        type="button"
        className={styles.help}
        aria-label={t("account.importHelp")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>

      {open && (
        <div ref={tipRef} className={styles.tip}>
          <p className={styles.tipLine}>{t("account.importHelpIntro")}</p>
          {/* Numbered because they are in an order and each one waits on the one
              before it: there is no exporting after the conversion and nothing
              to convert before the export. */}
          <ol className={styles.steps}>
            <li>{t("account.importHelpStep1")}</li>
            <li>{t("account.importHelpStep2")}</li>
            <li>{t("account.importHelpStep3")}</li>
          </ol>
          <p className={styles.note}>{t("account.importHelpNote")}</p>
          {/* The one press in here, and the only one there can be: everything
              else happens in another app. The panel goes with it — the file is in
              the reader's downloads and the next thing they do is not in lo, so
              leaving it up would be leaving them to put it away. */}
          <button
            type="button"
            className={styles.download}
            onClick={() => {
              downloadMarksPrompt();
              setOpen(false);
            }}
          >
            {t("account.importHelpDownload")}
          </button>
        </div>
      )}
    </>
  );
}
