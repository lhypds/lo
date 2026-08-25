import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal } from "../../ui/index.js";
import { formatCoords } from "../../utils/format.js";
import { compressToWebp, uploadImage } from "../../utils/image.js";
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
  const inputRef = useRef(null);
  const textRef = useRef(null);

  const busy = stage !== "" || submitting;

  useEffect(() => {
    if (!isOpen) return undefined;
    setBody("");
    setImage(null);
    setStage("");
    setError("");
    setSubmitting(false);
    // The keyboard should already be up on a phone by the time the sheet lands.
    const timer = window.setTimeout(() => textRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
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
    <Modal isOpen={isOpen} title={t("post.title")} onClose={busy ? undefined : onClose}>
      <form className={styles.form} onSubmit={submit} autoComplete="off">
        {where && <p className={styles.where}>{where}</p>}

        <textarea
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
        />

        <input ref={inputRef} type="file" accept="image/*" className={styles.file} onChange={handleChange} />

        {image ? (
          <div className={styles.frame}>
            {/* The picture is the post's own content, and the stored name is a
                digest — there is nothing to read out that the post does not
                already say. */}
            <img className={styles.image} src={image.url} alt="" />
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
      </form>
    </Modal>
  );
}
