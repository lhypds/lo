import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../ui/index.js";
import { downloadMarksPrompt } from "../../utils/marksPrompt.js";
import styles from "./account.module.css";

// The question mark after the verb, and the sheet it opens.
//
// The verb it stands beside says "import" and means one file: the marks.json lo
// itself hands out. That is a fine answer for a reader putting their own export
// back, and no answer at all for the reader this is for — somebody with years of
// places in Google Takeout, or a KML off a map app, looking at a picker that will
// refuse every one of them. The word cannot say what to do about that, and the
// sheet under it is the only place lo has to say it.
//
// What it says is not "lo will convert your file", because lo will not: the way
// across is the reader's own AI, handed their export and the prompt this offers.
// Three steps, in the order they happen, and the prompt at the foot as the one
// thing to take away.
//
// A sheet over a sheet rather than a block that opens inside the account: it is a
// digression, and the record it would push down is what the reader came here to
// read. Escape closes this one and leaves the account underneath standing, which
// is what the house Modal already does with a pile (see ui/Modal).
export default function ImportHelp() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* A circle rather than a word, because the line it sits on is already a
          sentence — a count, then a verb in brackets — and a second word in it
          would read as a second thing to do. The label is what it is for, said
          out loud for anything that cannot see the glyph. */}
      <button
        type="button"
        className={styles.help}
        aria-label={t("account.importHelp")}
        onClick={() => setOpen(true)}
      >
        ?
      </button>

      <Modal
        isOpen={open}
        title={t("account.importHelpTitle")}
        onClose={() => setOpen(false)}
        closeOnOverlay
      >
        <p className="modal-text">{t("account.importHelpIntro")}</p>
        {/* Numbered because they are in an order and each one waits on the one
            before it: there is no exporting after the conversion and nothing to
            convert before the export. */}
        <ol className={styles.steps}>
          <li>{t("account.importHelpStep1")}</li>
          <li>{t("account.importHelpStep2")}</li>
          <li>{t("account.importHelpStep3")}</li>
        </ol>
        <p className={styles.note}>{t("account.importHelpNote")}</p>
        {/* The one press on the sheet, and the only one there can be: everything
            else here happens in another app. It closes behind itself — the file
            is in the reader's downloads and the next thing they do is not in lo,
            so leaving the sheet up would be leaving them to put it away. */}
        <div className="modal-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              downloadMarksPrompt();
              setOpen(false);
            }}
          >
            {t("account.importHelpDownload")}
          </button>
        </div>
      </Modal>
    </>
  );
}
