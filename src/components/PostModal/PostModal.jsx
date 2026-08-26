import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal, TextArea } from "../../ui/index.js";
import { formatCoords } from "../../utils/format.js";
import { compressToWebp, preload, uploadImage } from "../../utils/image.js";
import styles from "./post.module.css";

const BODY_MAX = 500;

// The same pair the mark button holds to: long enough not to fire on a slow tap,
// short enough that holding it feels answered rather than stuck, and a press that
// wanders more than a few pixels was the start of a scroll.
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

// A stored photo comes back on the post as the URL that serves it, and what
// writing a post takes is the bare name — the file is content-addressed, so the
// last segment is it. Pulled apart here rather than carried as a second field on
// every post: the shape of that URL is one line of SQL away, and this is the
// only place that has to undo it.
function storedName(url) {
  return url ? url.split("/").pop() : null;
}

// Writing a post about the spot underfoot. The fix was taken when the press
// that opened this landed, not when Post is pressed — whoever is writing may
// take a minute over it, and the post belongs to the spot they were standing on
// when they decided to leave one.
//
// The photo is compressed and uploaded as soon as it is chosen rather than on
// submit: it is by far the slowest part, and doing it while the words are still
// being typed is time the writer was spending anyway.
//
// A `post` makes the same sheet an edit of that one, and the difference is only
// what it opens with and where it sends it. What can be changed is the words and
// the photo; the spot and the moment are what the post is filed under, so the
// line at the top goes on saying where it was left rather than where its author
// happens to be standing now.
export default function PostModal({ isOpen, coords, place, post = null, onClose, onCreated, onSaved }) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [image, setImage] = useState(null);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  // The shutter, held long enough that letting go now opens the album
  const [armed, setArmed] = useState(false);
  // Two ways to the same photo, because they are two different requests to the
  // phone: `capture` asks for the camera itself, and without it the same input
  // asks for what is already in the album. One input cannot be both — the
  // attribute is read when the picker opens — so the button carries one of each
  // and the gesture decides which one is asked.
  const cameraRef = useRef(null);
  const albumRef = useRef(null);
  const textRef = useRef(null);
  // The hold on the shutter: whether the press has become one, where it landed,
  // and the timer that decides. Which picker it means is read off `heldRef` by
  // the click that ends the press — see `tap`.
  const heldRef = useRef(false);
  const originRef = useRef(null);
  const holdRef = useRef(null);
  // Every element the pointer crosses fires its own dragenter and dragleave, so
  // the ones on the way in are counted rather than any single event believed —
  // otherwise crossing from the sheet onto the textarea inside it reads as
  // leaving, and the hint flickers off under a photo still being carried.
  const dragDepthRef = useRef(0);

  const busy = stage !== "" || submitting;
  const editing = Boolean(post);

  useEffect(() => {
    if (!isOpen) return undefined;
    // An edit opens on what is already there; a new post opens on nothing. The
    // photo is rebuilt into the shape the picker leaves behind, so everything
    // below — the frame, Remove, the submit — cannot tell the two apart.
    setBody(post?.body ?? "");
    setImage(
      post?.image
        ? {
            name: storedName(post.image),
            url: post.image,
            width: post.imageWidth ?? null,
            height: post.imageHeight ?? null,
          }
        : null,
    );
    setStage("");
    setError("");
    setSubmitting(false);
    setDragging(false);
    setArmed(false);
    dragDepthRef.current = 0;
    // The keyboard should already be up on a phone by the time the sheet lands.
    const timer = window.setTimeout(() => textRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [isOpen, post]);

  // A photo let go a little wide of the sheet must not cost the draft: left to
  // itself the browser opens the file over the page, and the half-written post
  // goes with it. Only drags carrying files are swallowed — dragging a bit of
  // text about inside the field is still the field's own business.
  useEffect(() => {
    if (!isOpen) return undefined;
    const swallow = (event) => {
      if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, [isOpen]);

  async function accept(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("post.notImage"));
      return;
    }
    setError("");
    setStage("compressing");
    try {
      const { blob, width, height } = await compressToWebp(file);
      setStage("uploading");
      const uploaded = await uploadImage(blob);
      // The button goes on saying Uploading until the picture can be painted,
      // not merely until the bytes have landed. Swapping it for the frame the
      // moment the server answers puts an empty bordered line on the sheet for
      // however long the fetch back takes, and the sheet jumps when it fills.
      await preload(uploaded.url);
      setImage({ name: uploaded.name, url: uploaded.url, width, height });
    } catch (uploadError) {
      setError(uploadError.message || t("post.uploadFailed"));
    } finally {
      setStage("");
    }
  }

  // The press is only timed here. Both pickers are opened from the click that
  // ends it, and that is the whole of why this is not simpler: a file dialog is
  // allowed out of a user gesture and nothing else, and a click is the one
  // context every engine agrees is one. A timeout 500ms into the press is not,
  // and neither is the pointerup just before the click — WebKit refuses the
  // dialog in both, and it refuses silently, which on a phone is indistinguishable
  // from a hold that was never noticed.
  useEffect(() => () => window.clearTimeout(holdRef.current), []);

  // The press is over — or was never going to be a hold. `heldRef` is left
  // standing on purpose: it is what the click reads, and it is set by the timer
  // rather than measured on the lift, so a press iOS takes away mid-gesture — a
  // pointercancel, after which no pointerup and no lift ever arrive — has still
  // said what it was by the time the click comes.
  function endPress() {
    window.clearTimeout(holdRef.current);
    holdRef.current = null;
    originRef.current = null;
    setArmed(false);
  }

  function startPress(event) {
    if (busy || event.button > 0) return;
    heldRef.current = false;
    originRef.current = { x: event.clientX, y: event.clientY };
    holdRef.current = window.setTimeout(() => {
      holdRef.current = null;
      heldRef.current = true;
      // Halfway through a gesture with nothing to show for it yet, so the button
      // says so itself: it inverts under the finger, and letting go now opens the
      // album. A buzz says the same thing where there is one to give — iOS has
      // none, which is exactly where the drawing has to do the talking.
      setArmed(true);
      if (navigator.vibrate) navigator.vibrate(30);
    }, LONG_PRESS_MS);
  }

  // A press that wanders was the start of a scroll, and the hold is called off
  // before it fires: the click that may still follow reads as a plain tap. Once
  // it has fired there is nothing left to call off — the button has already said
  // it is armed, and taking that back under a thumb that only rolled a little
  // would be the sheet changing its mind after the fact.
  function movePress(event) {
    const origin = originRef.current;
    if (!origin || !holdRef.current) return;
    if (
      Math.abs(event.clientX - origin.x) > LONG_PRESS_SLOP ||
      Math.abs(event.clientY - origin.y) > LONG_PRESS_SLOP
    ) {
      endPress();
    }
  }

  // The one place either picker is opened: a press long enough to have armed the
  // button is the album, and anything else — a tap, a press called off, a button
  // reached by the keyboard rather than pressed at all — is the camera.
  function tap() {
    const held = heldRef.current;
    heldRef.current = false;
    (held ? albumRef : cameraRef).current?.click();
  }

  function handleChange(event) {
    accept(event.target.files?.[0]);
    // The same file picked twice in a row still has to fire a change event
    event.target.value = "";
  }

  // Only a drag carrying files is the sheet's business: dragging a selection
  // around inside the textarea is a drag too, and it belongs to the textarea.
  function carriesFile(event) {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  function dragEnter(event) {
    if (!carriesFile(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragging(true);
  }

  // Refusing the default here is what makes the sheet a drop target at all —
  // without it the browser takes the file and opens it over the page instead.
  function dragOver(event) {
    if (!carriesFile(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function dragLeave(event) {
    if (!carriesFile(event)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  }

  function drop(event) {
    if (!carriesFile(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    // A photo dropped while the last one is still going up would take the
    // upload out from under itself; the button is disabled for the same reason.
    if (busy) return;
    accept(event.dataTransfer.files?.[0]);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const text = body.trim().normalize("NFKC");
    if (!text && !image) {
      setError(t("post.needsContent"));
      return;
    }
    // Only a new post needs a fix; an edit already has the one it was written on
    if (!editing && !coords) {
      setError(t("mark.needsLocation"));
      return;
    }
    setSubmitting(true);
    setError("");
    // The words and the photo, which is all an edit may change and all a new post
    // adds to the spot and the moment underneath it.
    const content = {
      body: text,
      image: image?.name ?? null,
      imageWidth: image?.width ?? null,
      imageHeight: image?.height ?? null,
    };
    try {
      if (editing) {
        const saved = await api.updatePost(post.id, content);
        onSaved(saved.post);
      } else {
        const written = await api.createPost({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          time: new Date().toISOString(),
          ...content,
        });
        onCreated(written.post);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  // An edit says where the post is, not where its author is: the spot is the one
  // thing about it that cannot be rewritten.
  const where = editing
    ? post.place || formatCoords(post.latitude, post.longitude)
    : place || (coords ? formatCoords(coords.latitude, coords.longitude) : "");

  return (
    <Modal
      isOpen={isOpen}
      title={editing ? t("post.editTitle") : t("post.title")}
      onClose={busy ? undefined : onClose}
      wide
    >
      <form
        className={styles.form}
        onSubmit={submit}
        autoComplete="off"
        // The whole sheet takes the drop, not just the photo button: the pointer
        // can be anywhere over it when the file is let go, and the words and the
        // picture are two halves of the same post.
        onDragEnter={dragEnter}
        onDragOver={dragOver}
        onDragLeave={dragLeave}
        onDrop={drop}
      >
        {where && <p className={styles.where}>{where}</p>}

        {/* The photo above the words, which is the order a post is made in as
            often as not: the picture is the reason there is something to say
            about this spot, and the words are the caption on it. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          // The back camera: a post is about the ground its writer is standing
          // on, not about the writer.
          capture="environment"
          className={styles.file}
          onChange={handleChange}
        />
        <input ref={albumRef} type="file" accept="image/*" className={styles.file} onChange={handleChange} />

        {image ? (
          <div className={styles.frame}>
            {/* The picture is the post's own content, and the stored name is a
                digest — there is nothing to read out that the post does not
                already say. */}
            {/* Sized from the compressed photo's own dimensions, as in the
                preview: the frame then holds the picture's box from the first
                frame it exists, so nothing collapses to a line if the bytes
                have to be fetched again. */}
            <img className={styles.image} src={image.url} alt="" width={image.width} height={image.height} />
            <button type="button" className={styles.remove} onClick={() => setImage(null)} disabled={busy}>
              {t("post.removePhoto")}
            </button>
          </div>
        ) : (
          // A shutter, with what the two gestures on it do written inside it: the
          // drawing says what the button is for, and the two lines under it say
          // how to work it — all three inside the one thing they are about, so
          // nothing on the sheet is a caption on something else.
          <button
            type="button"
            className={armed ? `${styles.photo} ${styles.photoArmed}` : styles.photo}
            onClick={tap}
            onPointerDown={startPress}
            onPointerMove={movePress}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            onPointerLeave={endPress}
            // Android raises its own menu on a hold, over the album this one is
            // about to open
            onContextMenu={(event) => event.preventDefault()}
            disabled={busy}
            aria-busy={busy}
          >
            <svg viewBox="0 0 24 24" className={styles.camera} aria-hidden="true">
              <path d="M3 8h4l1.5-2.5h7L17 8h4v11H3z" />
              <circle cx="12" cy="13.5" r="3.2" />
            </svg>
            {/* Two lines that belong together: what a tap does, and under it
                what a hold does. While a photo is on its way in the first line
                says where it has got to instead — the button is disabled by
                then, so it is also the only way that progress is announced, and
                the second line keeps its space rather than unmounting and
                letting the drawing above hop as it goes. */}
            <span className={styles.copy}>
              <span className={styles.tap} aria-live="polite">
                {stage === "uploading"
                  ? t("post.uploading")
                  : stage === "compressing"
                    ? t("post.compressing")
                    : t("post.photoTap")}
              </span>
              <span className={stage ? `${styles.hold} ${styles.holdHidden}` : styles.hold}>
                {t("post.photoHold")}
              </span>
            </span>
          </button>
        )}

        <TextArea
          ref={textRef}
          className={styles.text}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setError("");
          }}
          placeholder={t("post.placeholder")}
          maxLength={BODY_MAX}
          rows={4}
          // The floor the handle stops at, kept level with the field's own
          // opening height so dragging cannot shrink it under that.
          minHeight={96}
        />

        <div className={styles.footer}>
          <span className={styles.count}>
            {body.length}/{BODY_MAX}
          </span>
          <button type="submit" className="primary-button" disabled={busy}>
            {editing
              ? submitting
                ? t("post.saving")
                : t("common.save")
              : submitting
                ? t("post.posting")
                : t("post.submit")}
          </button>
        </div>

        {error && <p className="form-message error">{error}</p>}

        {/* Deaf to the pointer on purpose: a target that swallowed the drag
            would take the drop off the form and blink the hint on and off as
            the pointer crossed onto it. */}
        {dragging && <p className={styles.dropHint}>{t("post.dropPhoto")}</p>}
      </form>
    </Modal>
  );
}
