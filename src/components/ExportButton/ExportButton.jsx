import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal, showToast } from "../../ui/index.js";
import { useAuth } from "../AuthProvider/index.js";
import styles from "./export.module.css";

// Everything lo is keeping for this reader, out of lo: the account's own folder
// — its marks and its settings — as a zip.
//
// It is here rather than on the account sheet because of what it is about. The
// sheet is where a reader is looked after: a name, a line about themselves, the
// ways they can be reached. This is about their things, and taking your things
// out of an app is not a setting — it is the door, and a door belongs on the
// frame where it can be seen from anywhere in the building.
//
// A list of one for now, and a list all the same: what a zip is one of is
// formats, and the row says which one is coming down. A press straight on the
// button would leave nowhere to say it and nowhere to add the next one.
export default function ExportButton() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
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

  // Asked before it is built, because it is a file arriving on somebody's device
  // rather than a page opening: a reader who meant to press the button beside
  // this one should not find a zip in their downloads.
  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      await api.downloadExport(user.username);
      setAsking(false);
    } catch (error) {
      // Left open, so the button that failed is still under the finger. The
      // reason goes in a toast rather than into the sheet: it is the request that
      // went wrong, not the question the sheet is asking.
      showToast(error.message || t("export.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div ref={wrapperRef} className={styles.wrapper} data-open={open}>
        {/* Not an ActionButton, for the reason the plus and the language
            switcher beside it are not: those carry their tooltip in a box hung
            under the button, which is exactly where this list opens. The label
            is the name of the thing for a screen reader instead. */}
        <button
          type="button"
          className={styles.trigger}
          aria-label={t("export.title")}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {/* Out of lo and down: an arrow onto a line, which is the drawing every
              download in every app is, and the one glyph up here that would be
              read the same with no words around it at all. */}
          <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M4 21h16" />
          </svg>
        </button>
        <div className={styles.dropdown}>
          <button
            type="button"
            className={styles.option}
            onClick={() => {
              setOpen(false);
              setAsking(true);
            }}
          >
            {t("export.zip")}
          </button>
        </div>
      </div>

      <Modal
        isOpen={asking}
        title={t("export.title")}
        onClose={busy ? undefined : () => setAsking(false)}
        closeOnOverlay={!busy}
      >
        <p className="modal-text">{t("export.confirm")}</p>
        <div className="modal-actions">
          <button type="button" className="outline-button" onClick={() => setAsking(false)} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary-button" onClick={download} disabled={busy}>
            {busy ? t("export.working") : t("export.download")}
          </button>
        </div>
      </Modal>
    </>
  );
}
