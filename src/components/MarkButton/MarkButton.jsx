import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { showToast } from "../../ui/index.js";
import { MARK_PIN_EYE, MARK_PIN_PATH } from "../../utils/icons.js";
import { getLocationState, refreshLocation } from "../../utils/location.js";
import { useHere } from "../LocationProvider/index.js";
import MarkModal from "../MarkModal/index.js";
import styles from "./mark.module.css";

const MESSAGE_MS = 6000;

// Long enough not to fire on a slow tap, short enough that holding it feels
// answered rather than stuck.
const LONG_PRESS_MS = 500;
// A press that wanders this far was the start of a scroll, not a hold.
const LONG_PRESS_SLOP = 10;

// One tap, no dialog: the spot is saved with whatever fix is in hand and named
// afterwards, from the marks list, if it turns out to be worth a name.
//
// Holding the same button is the other thing that can be said about a spot —
// a post, with words and a photo, left on the map for everyone. Both start from
// the same gesture on the same square because they are the same question
// answered at two lengths.
export default function MarkButton({ onMarked, onUnmarked, onRenamed, onLongPress }) {
  const { t } = useTranslation();
  const { coords } = useHere();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [message, setMessage] = useState("");
  // The name sheet, open on the mark that was just made. A spot is marked in one
  // tap and named afterwards if it turns out to be worth a name — this is the
  // door to that, at the one moment the writer still knows which spot it was.
  const [editing, setEditing] = useState(false);
  const timerRef = useRef(null);
  const holdRef = useRef(null);
  const originRef = useRef(null);
  // Set when the hold fired, and read by the click that the same press sends
  // afterwards — without it, a hold would post *and* mark.
  const heldRef = useRef(false);
  // Every press gets a number, and taking one back bumps it: an answer that
  // arrives afterwards can tell it belongs to a press that no longer exists.
  const runRef = useRef(0);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      window.clearTimeout(holdRef.current);
    },
    [],
  );

  function cancelHold() {
    window.clearTimeout(holdRef.current);
    holdRef.current = null;
    originRef.current = null;
  }

  function startHold(event) {
    if (!onLongPress || saving || event.button > 0) return;
    heldRef.current = false;
    originRef.current = { x: event.clientX, y: event.clientY };
    holdRef.current = window.setTimeout(() => {
      holdRef.current = null;
      heldRef.current = true;
      // The only signal a hold has landed on a phone, where the finger is
      // covering the button it just changed.
      if (navigator.vibrate) navigator.vibrate(30);
      onLongPress();
    }, LONG_PRESS_MS);
  }

  // Leaving the button takes the press back — the hold that has not fired yet,
  // and the mark that is still being saved. The fix behind a save can take the
  // better part of a fifteen-second timeout to arrive, and moving off the black
  // square is the plainest way to say the spot is no longer wanted.
  //
  // Only a mouse can mean it: a touch pointer leaves the button on every tap,
  // the moment the finger lifts.
  function leave(event) {
    cancelHold();
    if (event.pointerType !== "mouse" || !saving) return;
    runRef.current += 1;
    setSaving(false);
  }

  function moveHold(event) {
    const origin = originRef.current;
    if (!origin) return;
    if (
      Math.abs(event.clientX - origin.x) > LONG_PRESS_SLOP ||
      Math.abs(event.clientY - origin.y) > LONG_PRESS_SLOP
    ) {
      cancelHold();
    }
  }

  function scheduleClear() {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setMessage("");
      setSaved(null);
    }, MESSAGE_MS);
  }

  async function mark() {
    // The press that opened the post sheet ends with a click on this button;
    // it has already been answered.
    if (heldRef.current) {
      heldRef.current = false;
      return;
    }
    if (saving) return;
    if (!coords) {
      setMessage(t("mark.needsLocation"));
      scheduleClear();
      return;
    }
    const run = (runRef.current += 1);
    setSaving(true);
    setMessage("");
    setSaved(null);
    // A tap is also a request for a current position: the mark is stamped with
    // the freshest fix the device can give, not the one the loop happened to
    // read twenty seconds ago. That fix has to be read back from the store —
    // `coords` here is the one this render closed over, which is exactly the
    // position just superseded.
    await refreshLocation().catch(() => {});
    // Waiting on the device is the long half of a save and nothing has been
    // sent yet, so a press taken back in this window leaves nothing behind.
    if (runRef.current !== run) return;
    const fix = getLocationState().coords ?? coords;
    try {
      const { mark: created } = await api.createMark({
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        time: new Date().toISOString(),
      });
      // Taken back while the mark was already on the wire. The server has it
      // either way, so it goes back the way undo sends one back — a cancelled
      // press must not leave a spot in the list nobody meant to keep.
      if (runRef.current !== run) {
        api.deleteMark(created.id).catch(() => {});
        return;
      }
      if (navigator.vibrate) navigator.vibrate(20);
      setSaved(created);
      setMessage(t("mark.saved"));
      onMarked?.(created);
      scheduleClear();
    } catch (error) {
      if (runRef.current !== run) return;
      setMessage(error.message);
      scheduleClear();
    } finally {
      // A later press owns the button now; this one has no state left to clear.
      if (runRef.current === run) setSaving(false);
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

  // The row under the button clears itself after a few seconds, and it is the
  // only way back to the sheet — so the clock stops while the sheet is open and
  // starts again when it closes, rather than pulling the row out from under a
  // name still being typed.
  function openEdit() {
    if (!saved) return;
    window.clearTimeout(timerRef.current);
    setEditing(true);
  }

  function closeEdit() {
    setEditing(false);
    if (saved) scheduleClear();
  }

  async function rename(label) {
    const { mark: renamed } = await api.renameMark(saved.id, label);
    setSaved(renamed);
    onRenamed?.(renamed);
    setEditing(false);
    scheduleClear();
  }

  // The message is a sibling of the button rather than a child: edit and undo
  // are themselves buttons, and one cannot sit inside another.
  return (
    <div className={styles.tile}>
      <button
        type="button"
        className={`${styles.button}${saving ? ` ${styles.busy}` : ""}`}
        onClick={mark}
        onPointerDown={startHold}
        onPointerMove={moveHold}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={leave}
        // Android raises its own menu on a hold, over the sheet this one opens
        onContextMenu={(event) => event.preventDefault()}
        // Busy, not disabled: a disabled button is dead to pointer events in
        // every engine, and leaving it is the one gesture that has to reach it
        // while a save is running. `mark` turns a second press away instead.
        aria-disabled={saving}
        aria-busy={saving}
      >
        <svg viewBox="0 0 24 24" className={styles.glyph} aria-hidden="true">
          <path d={MARK_PIN_PATH} />
          <circle {...MARK_PIN_EYE} />
        </svg>
        {/* A hold has no affordance of its own, so the tile says so — directly
            under the label it belongs to, and inside the button rather than
            over its bottom edge. It keeps its space while a message is showing
            instead of unmounting, or the glyph above would hop as it went. */}
        <span className={styles.copy}>
          <span className={styles.label}>{saving ? t("mark.saving") : t("mark.button")}</span>
          {onLongPress && (
            <span className={message ? `${styles.hint} ${styles.hintHidden}` : styles.hint}>
              {t("post.hint")}
            </span>
          )}
        </span>
      </button>
      <p className={styles.message} aria-live="polite">
        {saved ? (
          <>
            {message} (
            <button type="button" className={styles.action} onClick={openEdit}>
              {t("mark.edit")}
            </button>{" "}
            {t("mark.or")}{" "}
            <button type="button" className={styles.action} onClick={undo}>
              {t("mark.undo")}
            </button>
            )
          </>
        ) : (
          message
        )}
      </p>

      {/* Out to the body, because the tile is a query container: containment
          makes it the containing block for anything fixed inside it, and the
          sheet would be laid out across this square instead of the window. */}
      {createPortal(
        <MarkModal
          isOpen={editing}
          title={t("mark.nameTitle")}
          submitLabel={t("common.save")}
          initialValue={saved?.label ?? ""}
          onClose={closeEdit}
          onSubmit={rename}
        />,
        document.body,
      )}
    </div>
  );
}
