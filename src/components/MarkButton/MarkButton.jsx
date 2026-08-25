import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { showToast } from "../../ui/index.js";
import { getLocationState } from "../../utils/location.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./mark.module.css";

const MESSAGE_MS = 6000;

// One tap, no dialog: the spot is saved with whatever fix is in hand and named
// afterwards, from the marks list, if it turns out to be worth a name.
export default function MarkButton({ onMarked, onUnmarked }) {
  const { t } = useTranslation();
  const { coords, refresh } = useHere();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [message, setMessage] = useState("");
  const timerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function scheduleClear() {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setMessage("");
      setSaved(null);
    }, MESSAGE_MS);
  }

  async function mark() {
    if (saving) return;
    if (!coords) {
      setMessage(t("mark.needsLocation"));
      scheduleClear();
      return;
    }
    setSaving(true);
    setMessage("");
    setSaved(null);
    // A tap is also a request for a current position: the mark is stamped with
    // the freshest fix the device can give, not one from ten minutes ago. That
    // fix has to be read back from the store — `coords` here is the one this
    // render closed over, which is exactly the position just superseded.
    await refresh().catch(() => {});
    const fix = getLocationState().coords ?? coords;
    try {
      const { mark: created } = await api.createMark({
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        time: new Date().toISOString(),
      });
      if (navigator.vibrate) navigator.vibrate(20);
      setSaved(created);
      setMessage(t("mark.saved"));
      onMarked?.(created);
      scheduleClear();
    } catch (error) {
      setMessage(error.message);
      scheduleClear();
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (!saved) return;
    window.clearTimeout(timerRef.current);
    const target = saved;
    setSaved(null);
    setMessage("");
    try {
      await api.deleteMark(target.id);
      onUnmarked?.(target);
      showToast(t("mark.removed"), 1800);
    } catch (error) {
      setMessage(error.message);
      scheduleClear();
    }
  }

  // The message is a sibling of the button rather than a child: undo is itself
  // a button, and one cannot sit inside another.
  return (
    <div className={styles.tile}>
      <button
        type="button"
        className={`${styles.button}${saving ? ` ${styles.busy}` : ""}`}
        onClick={mark}
        disabled={saving}
      >
        <svg viewBox="0 0 24 24" className={styles.glyph} aria-hidden="true">
          <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        <span className={styles.label}>{saving ? t("mark.saving") : t("mark.button")}</span>
      </button>
      <p className={styles.message} aria-live="polite">
        {saved ? (
          <>
            {message} (
            <button type="button" className={styles.undo} onClick={undo}>
              {t("mark.undo")}
            </button>
            )
          </>
        ) : (
          message
        )}
      </p>
    </div>
  );
}
