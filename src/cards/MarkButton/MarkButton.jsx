import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { TileId, showToast } from "../../ui/index.js";
import { MARK_PIN_EYE, MARK_PIN_PATH } from "../../utils/icons.js";
import { getLocationState, refreshLocation } from "../../utils/location.js";
import { useHere } from "../../components/LocationProvider/index.js";
import ComposeModal from "../../components/ComposeModal/index.js";
import styles from "./mark.module.css";

const MESSAGE_MS = 6000;

// Long enough not to fire on a slow tap, short enough that holding it feels
// answered rather than stuck.
const LONG_PRESS_MS = 500;
// A press that wanders this far was the start of a scroll, not a hold.
const LONG_PRESS_SLOP = 10;

// One tap keeps the spot. Nothing is asked and nothing is opened: the fix goes
// up as it stands, and the row under the button says it landed. A spot kept this
// way has no name and no picture, which is not a spot half-made — it is where
// the reader was standing, which is the whole of what a mark is and the only
// part of it that cannot be added later. The row offers Edit for the rest.
//
// Asking first was the older shape, and it charged a sheet, a keyboard and two
// decisions for the one thing this button is for. The name is worth asking for
// exactly when there is a name; the reader says so by holding instead.
//
// Holding is the same gesture gone longer and lands on the same thing gone
// further: the sheet, opened on a mark, with the words and the photograph the
// tap did not stop to ask for — and a switch at the top of it for the reader who
// meant a post instead, which is the same spot said out loud to everyone rather
// than kept (see ComposeModal).
export default function MarkButton({ onMarked, onUnmarked, onUpdated, onLongPress }) {
  const { t } = useTranslation();
  const { coords } = useHere();
  // A tile like any other on the grid, and named like one, so a card being
  // carried across the dashboard can take its place (see HomePage). It cannot be
  // picked up itself: what a card is carried by is its heading, and this square is
  // a button with no heading to hold.
  const tile = useContext(TileId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [message, setMessage] = useState("");
  // The sheet opened a second time on a spot already kept — the Edit in the row
  // under the button. Here it names the spot and hangs a picture on it; what it
  // cannot do is move it.
  const [editing, setEditing] = useState(false);
  const timerRef = useRef(null);
  const holdRef = useRef(null);
  const originRef = useRef(null);
  // Set when the hold fired, and read by the click that the same press sends
  // afterwards — without it, a hold would open the sheet *and* keep a spot.
  const heldRef = useRef(false);
  // Every press gets a number, and taking one back bumps it: an answer that
  // arrives afterwards can tell it belongs to a press that no longer exists.
  const runRef = useRef(0);
  // Which half of a tap is running. Waiting on the device is the long half and
  // nothing has been sent yet; once the mark is on the wire there is nothing
  // left to call off, and Undo in the row is what takes it back instead.
  const sendingRef = useRef(false);

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
  // and the tap that is still waiting on the device. That wait can be the better
  // part of a fifteen-second timeout, and moving off the black square is the
  // plainest way to say the spot is no longer wanted.
  //
  // Only until the mark is sent: after that the request is out, and a pointer
  // wandering off a square is not a thing to answer by quietly unsending it.
  //
  // Only a mouse can mean any of it: a touch pointer leaves the button on every
  // tap, the moment the finger lifts.
  function leave(event) {
    cancelHold();
    if (event.pointerType !== "mouse" || !saving || sendingRef.current) return;
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
    // The press that opened the sheet ends with a click on this button; it has
    // already been answered.
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
    sendingRef.current = false;
    setSaving(true);
    setMessage("");
    setSaved(null);
    // Whatever the last press left under the button goes now, rather than a few
    // seconds into this one — its clock would otherwise run out over this one.
    window.clearTimeout(timerRef.current);
    // A tap is also a request for a current position: the mark is stamped with
    // the freshest fix the device can give, not the one the loop happened to
    // read twenty seconds ago. That fix has to be read back from the store —
    // `coords` here is the one this render closed over, which is exactly the
    // position just superseded.
    await refreshLocation().catch(() => {});
    // A press taken back while the device was being waited on leaves nothing
    // behind, because nothing has been sent yet. The press that took it back
    // cleared `saving` when it did.
    if (runRef.current !== run) return;
    sendingRef.current = true;
    const fix = getLocationState().coords ?? coords;
    try {
      // Stamped with the moment the fix was taken, which on a tap is the moment
      // the reader pressed: they were standing there when they meant it.
      const { mark: created } = await api.createMark({
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        time: new Date().toISOString(),
      });
      if (runRef.current !== run) return;
      if (navigator.vibrate) navigator.vibrate(20);
      setSaved(created);
      setMessage(t("mark.saved"));
      onMarked?.(created);
    } catch (error) {
      if (runRef.current !== run) return;
      setMessage(error.message);
    } finally {
      if (runRef.current === run) {
        sendingRef.current = false;
        setSaving(false);
        scheduleClear();
      }
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

  function edited(mark) {
    setSaved(mark);
    onUpdated?.(mark);
    setEditing(false);
    scheduleClear();
  }

  // The message is a sibling of the button rather than a child: edit and undo
  // are themselves buttons, and one cannot sit inside another.
  return (
    <div className={styles.tile} data-card={tile ?? undefined}>
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
              {t("mark.hint")}
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
        <ComposeModal isOpen={editing && Boolean(saved)} mark={saved} onClose={closeEdit} onSaved={edited} />,
        document.body,
      )}
    </div>
  );
}
