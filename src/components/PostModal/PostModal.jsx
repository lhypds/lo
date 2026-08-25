import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal, TextArea } from "../../ui/index.js";
import { formatCoords } from "../../utils/format.js";
import { compressToWebp, preload, uploadImage } from "../../utils/image.js";
import styles from "./post.module.css";

const BODY_MAX = 500;

// Writing a post about the spot underfoot. The fix was taken when the press
// that opened this landed, not when Post is pressed — whoever is writing may
// take a minute over it, and the post belongs to the spot they were standing on
// when they decided to leave one.
//
// The photo is compressed and uploaded as soon as it is chosen rather than on
// submit: it is by far the slowest part, and doing it while the words are still
// being typed is time the writer was spending anyway.
export default function PostModal({ isOpen, coords, place, onClose, onCreated }) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [image, setImage] = useState(null);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const textRef = useRef(null);
  // Every element the pointer crosses fires its own dragenter and dragleave, so
  // the ones on the way in are counted rather than any single event believed —
  // otherwise crossing from the sheet onto the textarea inside it reads as
  // leaving, and the hint flickers off under a photo still being carried.
  const dragDepthRef = useRef(0);

  const busy = stage !== "" || submitting;

  useEffect(() => {
    if (!isOpen) return undefined;
    setBody("");
    setImage(null);
    setStage("");
    setError("");
    setSubmitting(false);
    setDragging(false);
    dragDepthRef.current = 0;
    // The keyboard should already be up on a phone by the time the sheet lands.
    const timer = window.setTimeout(() => textRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

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
    if (!coords) {
      setError(t("mark.needsLocation"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { post } = await api.createPost({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        time: new Date().toISOString(),
        body: text,
        image: image?.name ?? null,
        imageWidth: image?.width ?? null,
        imageHeight: image?.height ?? null,
      });
      onCreated(post);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  const where = place || (coords ? formatCoords(coords.latitude, coords.longitude) : "");

  return (
    <Modal isOpen={isOpen} title={t("post.title")} onClose={busy ? undefined : onClose} wide>
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

        <input ref={inputRef} type="file" accept="image/*" className={styles.file} onChange={handleChange} />

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
          <button
            type="button"
            className={styles.photo}
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {stage === "uploading"
              ? t("post.uploading")
              : stage === "compressing"
                ? t("post.compressing")
                : t("post.addPhoto")}
          </button>
        )}

        <div className={styles.footer}>
          <span className={styles.count}>
            {body.length}/{BODY_MAX}
          </span>
          <button type="submit" className="primary-button" disabled={busy}>
            {submitting ? t("post.posting") : t("post.submit")}
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
