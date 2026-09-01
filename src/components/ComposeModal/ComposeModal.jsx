import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { AuthImage, Modal, TextArea } from "../../ui/index.js";
import { formatCoords } from "../../utils/format.js";
import { compressPhoto, preload, storedName, uploadImage } from "../../utils/image.js";
import styles from "./compose.module.css";

const BODY_MAX = 500;
// A name is read back on a row in a list and on a pin over a map. It is a handle
// for a spot rather than anything anybody reads, which is why it gets a fortieth
// of the room a post does — and it is the server's own limit (see POST
// /api/marks), said here so the box stops before the request has to.
const NAME_MAX = 48;

// How deep the box opens, whichever of the two is being written in it. One
// number rather than one per kind: the field is the tallest thing on the sheet,
// and a field that resized itself when the switch was thrown moved everything
// under it out from under the thumb that threw it. Between the two lengths it
// serves — deeper than a name needs so the box does not read as a slot, shallower
// than a post's paragraphs, which the handle in the corner is there to open out.
const FIELD_HEIGHT = 110;

// The same pair the mark button holds to: long enough not to fire on a slow tap,
// short enough that holding it feels answered rather than stuck, and a press that
// wanders this far was the start of a scroll rather than a hold.
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

// Writing something about the spot underfoot — a mark or a post, which are the
// two things there are to write and one sheet away from each other. The fix was
// taken when the press that opened this landed, not when the button at the foot
// is pressed: whoever is writing may take a minute over it, and what they write
// belongs to the spot they were standing on when they decided to write it.
//
// The two differ in who they are for and in nothing else the sheet does. A mark
// is the reader's own — it is kept in their folder, it is drawn on their map,
// and nobody else ever sees it — so what it asks for is a name, the handle they
// will find the spot by later. A post is left out on the ground for whoever
// comes past, so what it asks for is what there is to say. Both take a
// photograph, because standing somewhere worth keeping and standing somewhere
// worth saying something about look the same through a camera.
//
// A mark is where the toggle opens, because a mark is what the button under it
// makes when it is merely tapped: the hold is the same gesture gone longer, and
// it should land on the same thing gone further rather than on something else.
//
// The photo is compressed and uploaded as soon as it is chosen rather than on
// submit: it is by far the slowest part, and doing it while the words are still
// being typed is time the writer was spending anyway.
//
// A `mark` or a `post` makes the same sheet an edit of that one, and the
// difference is only what it opens with and where it sends it. What can be
// changed is the words and the photo; where and when are what the row is filed
// under, so the line at the top goes on saying where it was left rather than
// where its author happens to be standing now — and the toggle is gone, since a
// spot somebody kept is not something an edit can turn into a post.
export default function ComposeModal({ isOpen, coords, place, mark = null, post = null, onClose, onCreated, onSaved }) {
  const { t, i18n } = useTranslation();
  // Which of the two is being written. Only ever asked on the way in: an edit is
  // told which by which of the two rows it was handed.
  const [kind, setKind] = useState("mark");
  // One box for both, because it is one question at two lengths — what is this
  // spot called, and what is there to say about it — and a reader who has typed
  // a line and then changed their mind about who it is for should find the line
  // still there.
  const [body, setBody] = useState("");
  const [image, setImage] = useState(null);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Two ways to the same photo, because they are two different requests to the
  // phone: `capture` asks for the camera itself, and without it the same input
  // asks for what is already in the album. One input cannot be both — the
  // attribute is read when the picker opens — so there is one of each, and the
  // tap and the hold ask one each.
  const cameraRef = useRef(null);
  const albumRef = useRef(null);
  const textRef = useRef(null);
  // The hold on the shutter: where the press landed, the timer that decides
  // whether it is a hold, and whether it has become one — which is what the
  // click at the end of the same press reads, so that a hold does not also take
  // a photo on the engines that send a click after one.
  const originRef = useRef(null);
  const holdRef = useRef(null);
  const heldRef = useRef(false);
  // Every element the pointer crosses fires its own dragenter and dragleave, so
  // the ones on the way in are counted rather than any single event believed —
  // otherwise crossing from the sheet onto the textarea inside it reads as
  // leaving, and the hint flickers off under a photo still being carried.
  const dragDepthRef = useRef(0);

  const busy = stage !== "" || submitting;
  // The row this sheet was opened on, where it was opened on one — a mark and a
  // post carry their picture under the same four names, so everything below the
  // first few lines can be written once and asked no further questions.
  const written = mark ?? post;
  const editing = Boolean(written);
  const naming = kind === "mark";

  useEffect(() => {
    if (!isOpen) return undefined;
    // Which of the two, and it is only ever a question on a new one: an edit is
    // whichever row it was handed, and a mark cannot be edited into a post.
    setKind(post ? "post" : "mark");
    // An edit opens on what is already there; a new one opens on nothing. A
    // spot opens on its name in the language this sheet is about to write one in
    // rather than on the name the row is showing: a box that opened on the
    // Chinese name a Japanese reading is standing in for would have the reader
    // save that Chinese name into Japanese by pressing the button they came to
    // press (see labelName, and readLabel on the server).
    setBody(post ? (post.body ?? "") : (mark?.label?.[i18n.language] ?? ""));
    // The photo is rebuilt into the shape the picker leaves behind, so
    // everything below — the frame, Remove, the submit — cannot tell the two
    // apart, any more than it can tell a mark's photo from a post's.
    setImage(
      written?.image
        ? {
            name: storedName(written.image),
            url: written.image,
            // Undone alongside it, so an edit that leaves the photo alone writes
            // the same pair of names back rather than dropping the small one and
            // leaving every list to fetch the picture again.
            thumbName: storedName(written.imageThumb),
            width: written.imageWidth ?? null,
            height: written.imageHeight ?? null,
          }
        : null,
    );
    setStage("");
    setError("");
    setSubmitting(false);
    setDragging(false);
    dragDepthRef.current = 0;
    heldRef.current = false;
    // The keyboard should already be up on a phone by the time the sheet lands.
    const timer = window.setTimeout(() => textRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
    // The language is in for the line above: switching it while a spot's sheet
    // is open is asking for the box to be about that language now, and the name
    // it holds belongs to the one that was showing.
  }, [isOpen, mark, post, written, i18n.language]);

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

  useEffect(() => () => window.clearTimeout(holdRef.current), []);

  async function accept(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("post.notImage"));
      return;
    }
    setError("");
    setStage("compressing");
    try {
      // Two files out of the one photo — the picture and the thumbnail every
      // list will draw in its place — and one decode between them.
      const { full, thumb } = await compressPhoto(file);
      setStage("uploading");
      // Side by side rather than one after the other: they are two unrelated
      // writes to a folder that names files after their own bytes, and the
      // thumbnail is small enough that the pair costs what the picture did.
      const [uploaded, uploadedThumb] = await Promise.all([
        uploadImage(full.blob),
        thumb ? uploadImage(thumb.blob) : null,
      ]);
      // The button goes on saying Uploading until the picture can be painted,
      // not merely until the bytes have landed. Swapping it for the frame the
      // moment the server answers puts an empty bordered line on the sheet for
      // however long the fetch back takes, and the sheet jumps when it fills.
      //
      // The picture and not the thumbnail, because the picture is what the frame
      // below shows: this is the one screen in lo that draws the photo full size
      // without being asked, since it is the photo about to be posted.
      await preload(uploaded.url);
      setImage({
        name: uploaded.name,
        url: uploaded.url,
        thumbName: uploadedThumb?.name ?? null,
        width: full.width,
        height: full.height,
      });
    } catch (uploadError) {
      setError(uploadError.message || t("post.uploadFailed"));
    } finally {
      setStage("");
    }
  }

  function openCamera() {
    cameraRef.current?.click();
  }

  function openAlbum() {
    albumRef.current?.click();
  }

  // The album is asked for twice, and the two engines refuse opposite halves of
  // it. A file dialog is allowed out of a user gesture and nothing else, and
  // they do not mean the same thing by that.
  //
  // Blink counts activation as transient rather than stack-bound: the
  // pointerdown that began the press opens a window a few seconds wide, and a
  // timeout does not close it. What it will not do is give a long press away —
  // it takes one to be its own gesture and sends nothing afterwards that counts,
  // not the click, the pointerup, the touchend, or the contextmenu. So on
  // Android the ask has to happen early, from the timer below, with the finger
  // still down and before Blink has anything to take away.
  //
  // WebKit is the other way round. It never took up transient activation for
  // file dialogs: the ask has to sit in the gesture's own call stack, which a
  // timeout is not, so the one below is thrown away on iOS. What it does send
  // is the click that ends the press — and that is where `tap` asks again.
  //
  // Neither ask can fire twice, because each engine drops one of them: Blink
  // opens the album from the timer and then sends no click at all, and WebKit
  // discards the timer's and answers the click. `document.hasFocus` is the belt
  // to that pair of braces — a dialog that is already up has taken the focus.
  function startPress(event) {
    if (busy || event.button > 0) return;
    heldRef.current = false;
    originRef.current = { x: event.clientX, y: event.clientY };
    holdRef.current = window.setTimeout(() => {
      holdRef.current = null;
      heldRef.current = true;
      // The buzz is the answer to a hold on a phone, where the finger is
      // covering the button it just worked — and the album is the rest of it.
      if (navigator.vibrate) navigator.vibrate(30);
      openAlbum();
    }, LONG_PRESS_MS);
  }

  // `heldRef` is left standing on purpose — it is what the click reads, and the
  // press it describes is over either way.
  function endPress() {
    window.clearTimeout(holdRef.current);
    holdRef.current = null;
    originRef.current = null;
  }

  // A press that wanders was the start of a scroll, and the hold is called off
  // before it fires: the click that may still follow reads as a plain tap.
  function movePress(event) {
    const origin = originRef.current;
    if (!origin) return;
    if (Math.abs(event.clientX - origin.x) > LONG_PRESS_SLOP || Math.abs(event.clientY - origin.y) > LONG_PRESS_SLOP) {
      endPress();
    }
  }

  // The click that ends a hold is not a tap — it must not also take a photo. On
  // WebKit it is something better: the one context that engine will open a file
  // dialog from, and so the hold's second and only real ask. On Blink no click
  // arrives after a hold at all, and `heldRef` is cleared by the next press
  // rather than by this one.
  function tap() {
    if (heldRef.current) {
      heldRef.current = false;
      // Unless the timer's ask already landed, in which case the album is up and
      // holding the focus, and asking again would put a second one over it.
      if (document.hasFocus()) openAlbum();
      return;
    }
    if (busy) return;
    openCamera();
  }

  // A right-click, and the Menu key behind it — the way to the album that does
  // not start with a finger, and the only one a keyboard has. Asked here only
  // when no press is in flight: during a hold the timer above has it, or is
  // about to, and this would open the dialog a second time.
  function menuKey(event) {
    // Android raises its own menu on a hold, over the album this one is opening
    event.preventDefault();
    if (busy || holdRef.current !== null || heldRef.current) return;
    openAlbum();
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

  // Which of the two this is going to be. What has been typed stays typed —
  // changing your mind about who a line is for is not a reason to lose it — but
  // a post's length is not a name's, so anything past what a name may be is cut
  // here rather than refused at the foot of the sheet. The count under the box
  // says so as it happens.
  function choose(next) {
    if (busy || next === kind) return;
    setKind(next);
    if (next === "mark") setBody((typed) => typed.slice(0, NAME_MAX));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    // A name is folded onto one line on the way out: the box can be dragged to
    // two or ten, but a name is read back on a row in a list and on a pin over a
    // map, where a return is not a line break so much as a hole in the word.
    // Normalised first, so that the wide space CJK keyboards type is a space by
    // the time the fold looks for one.
    const text = naming ? body.normalize("NFKC").replace(/\s+/g, " ").trim() : body.trim().normalize("NFKC");
    // A post has to be something somebody left. A mark does not: an empty one is
    // exactly what a tap on the button makes, and a spot may simply not need a
    // name.
    if (!naming && !text && !image) {
      setError(t("post.needsContent"));
      return;
    }
    // Only a new one needs a fix; an edit already has the one it was written on
    if (!editing && !coords) {
      setError(t("mark.needsLocation"));
      return;
    }
    setSubmitting(true);
    setError("");
    // The photo, which is all either kind carries besides its words — and all an
    // edit may change about it, along with the words themselves.
    const photo = {
      image: image?.name ?? null,
      imageThumb: image?.thumbName ?? null,
      imageWidth: image?.width ?? null,
      imageHeight: image?.height ?? null,
    };
    // Where and when, which a new row is filed under and an edit never touches.
    const ground = {
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      accuracy: coords?.accuracy,
      time: new Date().toISOString(),
    };
    try {
      if (mark) {
        const saved = await api.updateMark(mark.id, { label: text, ...photo });
        onSaved(saved.mark, "mark");
      } else if (post) {
        const saved = await api.updatePost(post.id, { body: text, ...photo });
        onSaved(saved.post, "post");
      } else if (naming) {
        const kept = await api.createMark({ ...ground, label: text, ...photo });
        onCreated(kept.mark, "mark");
      } else {
        const left = await api.createPost({ ...ground, body: text, ...photo });
        onCreated(left.post, "post");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  // An edit says where the row is, not where its author is: the ground is the one
  // thing about it that cannot be rewritten. A mark has no place name to say it
  // by — a geocoder's line is where the phone was rather than what the spot is,
  // and lo stopped writing one down (see POST /api/marks) — so it is read by its
  // coordinates, which are the truth about it and the one thing every mark has.
  const where = editing
    ? (post?.place ?? "") || formatCoords(written.latitude, written.longitude)
    : place || (coords ? formatCoords(coords.latitude, coords.longitude) : "");

  // The sheet says which of the four things it is doing, and the toggle below
  // the title is how the reader changes their mind about the half of that the
  // toggle owns.
  const title = editing
    ? naming
      ? t("mark.editTitle")
      : t("post.editTitle")
    : naming
      ? t("mark.title")
      : t("post.title");

  // And so does the button at the foot of it: what it says is what pressing it
  // does — a spot kept, a post left, or either of them saved again — rather than
  // one word standing for all three. While the request is out it says so, which
  // is the only word the sheet gives on a save that has not landed yet.
  const submitLabel = submitting
    ? naming
      ? t("mark.saving")
      : editing
        ? t("post.saving")
        : t("post.posting")
    : editing
      ? t("common.save")
      : naming
        ? t("mark.submit")
        : t("post.submit");

  return (
    <Modal isOpen={isOpen} title={title} onClose={busy ? undefined : onClose} wide>
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
        {/* Who this is for, which is the whole difference between the two and
            the first thing the sheet asks. Two halves of one control rather than
            two buttons: what is being chosen is which of them this is, and one
            of them always is — so the pair reads as a switch that is thrown and
            not as a pair of things that could both be pressed.

            Missing on an edit, where the question has an answer already: a spot
            somebody kept is not something a second thought can turn into a post
            for everyone to read.

            A group of two pressed buttons rather than a radio group: a radio
            group promises the arrow keys move between its options, and these are
            two buttons a Tab reaches one at a time. What is said instead is
            which of them is down, which is what the black half means. */}
        {!editing && (
          <div className={styles.kinds} role="group" aria-label={t("compose.kind")}>
            <button
              type="button"
              aria-pressed={naming}
              className={naming ? `${styles.kind} ${styles.kindOn}` : styles.kind}
              onClick={() => choose("mark")}
              disabled={busy}
            >
              {t("compose.mark")}
            </button>
            <button
              type="button"
              aria-pressed={!naming}
              className={naming ? styles.kind : `${styles.kind} ${styles.kindOn}`}
              onClick={() => choose("post")}
              disabled={busy}
            >
              {t("compose.post")}
            </button>
          </div>
        )}

        {/* Who will see it and where it is, on the two lines under the switch —
            the first is what the switch just decided and the second is the
            ground both kinds are filed under. The audience is said in words
            rather than left to be inferred from a label: a reader deciding
            between the two is deciding exactly this. */}
        {!editing && <p className={styles.who}>{naming ? t("compose.markWho") : t("compose.postWho")}</p>}
        {where && <p className={styles.where}>{where}</p>}

        {/* The photo above the words, which is the order a post is made in as
            often as not: the picture is the reason there is something to say
            about this spot, and the words are the caption on it. */}
        {/* Out of sight and out of the tab order: the two buttons below are the
            controls, and these are how they ask. */}
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
            <AuthImage className={styles.image} src={image.url} alt="" width={image.width} height={image.height} />
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
            className={styles.photo}
            onClick={tap}
            onPointerDown={startPress}
            onPointerMove={movePress}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            onPointerLeave={endPress}
            onContextMenu={menuKey}
            disabled={busy}
            aria-busy={busy}
          >
            <svg viewBox="0 0 24 24" className={styles.glyph} aria-hidden="true">
              <path d="M3 8h4l1.5-2.5h7L17 8h4v11H3z" />
              <circle cx="12" cy="13.5" r="3.2" />
            </svg>
            {/* Two lines that belong together: what a tap does, and under it
                what a hold does. While a photo is on its way the first line says
                where it has got to instead — the button is disabled by then, so
                it is also the only word the sheet gives on it, and the second
                keeps its space rather than unmounting and letting the drawing
                above hop as it goes. */}
            <span className={styles.copy}>
              <span className={styles.tap} aria-live="polite">
                {stage === "uploading"
                  ? t("post.uploading")
                  : stage === "compressing"
                    ? t("post.compressing")
                    : t("post.photoTap")}
              </span>
              <span className={stage ? `${styles.hold} ${styles.holdHidden}` : styles.hold}>{t("post.photoHold")}</span>
            </span>
          </button>
        )}

        {/* One box, and one height for both. Sizing it to whichever half the
            switch was on made the sheet jump under the reader's thumb every time
            they threw it — the field is the biggest thing on the sheet, and
            everything below it moved. So it opens at a height between the two: a
            name has room to breathe and a post has room to start, and the handle
            in the corner opens it out for whoever wants more. */}
        <TextArea
          ref={textRef}
          className={styles.text}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setError("");
          }}
          // On a post, Cmd/Ctrl+Enter posts and a plain Enter is a newline,
          // since a post is written in paragraphs where a message is a line. On
          // a name it is the other way about: the box holds one line, so Enter
          // answers the sheet and Shift+Enter opens a line the fold on the way
          // out closes again. A return that only picks a candidate out of an
          // IME's list (CJK input) is left to the IME either way.
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            if (naming ? !event.shiftKey : event.metaKey || event.ctrlKey) submit(event);
          }}
          placeholder={naming ? t("mark.namePlaceholder") : t("post.placeholder")}
          maxLength={naming ? NAME_MAX : BODY_MAX}
          rows={3}
          // The floor the handle stops at, kept level with the field's own
          // opening height so dragging cannot shrink it under that.
          minHeight={FIELD_HEIGHT}
          enterKeyHint={naming ? "done" : undefined}
        />

        <div className={styles.footer}>
          <span className={styles.count}>
            {body.length}/{naming ? NAME_MAX : BODY_MAX}
          </span>
          <button type="submit" className="primary-button" disabled={busy}>
            {submitLabel}
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
