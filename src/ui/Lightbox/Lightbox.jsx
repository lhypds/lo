import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authImageUrl, preload } from "../../utils/image.js";
import styles from "./lightbox.module.css";

// One picture, as large as the window will take it, on a ground dark enough that
// nothing behind it competes.
//
// This is the other half of storing a photo twice. Every list, row and bubble in
// lo draws the thumbnail, which is small so that forty of them cost nothing; the
// photograph itself is fetched here and nowhere else, by a reader who has
// pressed one and asked to see it properly.
//
// So it opens on the thumbnail rather than on nothing. That picture is already
// in hand — it is the one that was pressed, and authImageUrl remembers what it
// has fetched — so the box fills at once with the right image at the wrong
// resolution, and sharpens when the photograph lands behind it. The alternative
// is an empty rectangle for as long as a megabyte takes on a phone, which reads
// as a viewer that has failed rather than one that is loading.
//
// The box is worked out from the photo's own proportions and the window, not
// from whichever of the two images is in it: that is what keeps the swap a
// sharpening rather than a jump. Where a post is old enough not to know its
// dimensions there is no thumbnail either, so there is nothing to swap and the
// picture simply sizes itself.
export default function Lightbox({ photo, onClose }) {
  const { t } = useTranslation();
  const [src, setSrc] = useState("");
  const [loaded, setLoaded] = useState(false);
  // Read when the reader closes rather than closed over: the page passes a fresh
  // arrow every render, and an effect that depended on it would tear down and
  // rebuild — which for the one below means handing the page's own scroll back
  // while the picture is still up.
  const close = useRef(onClose);
  close.current = onClose;

  const picture = photo?.src ?? null;
  const small = photo?.thumb ?? null;

  useEffect(() => {
    if (!picture) return undefined;
    let cancelled = false;
    setSrc("");
    setLoaded(false);

    // Whichever arrives first wins, and the thumbnail never takes the picture's
    // place: on a photo already looked at once, both are in the map and both
    // resolve on the same turn.
    if (small && small !== picture) {
      authImageUrl(small).then(
        (url) => {
          if (!cancelled) setSrc((current) => current || url);
        },
        () => {
          // Nothing to show yet, which the line below is already saying
        },
      );
    }

    // Held until the pixels are decoded, not merely fetched: swapping the src the
    // moment the bytes land blanks the box for a frame on a large photo, which is
    // the one thing the thumbnail underneath is there to prevent.
    preload(picture)
      .then(() => authImageUrl(picture))
      .then(
        (url) => {
          if (!cancelled) {
            setSrc(url);
            setLoaded(true);
          }
        },
        () => {
          // The thumbnail stays up. A picture that will not load is not worth
          // taking down the one that did.
        },
      );

    return () => {
      cancelled = true;
    };
  }, [picture, small]);

  // Escape closes it, and the page under it holds still while it is open — the
  // viewer covers the window, and a wheel over it scrolling the dashboard behind
  // would move what the reader comes back to.
  useEffect(() => {
    if (!picture) return undefined;
    const key = (event) => {
      if (event.key !== "Escape") return;
      // The press an input method is still holding is a reader dismissing a
      // candidate list, the same exception every sheet in lo makes.
      if (event.isComposing || event.keyCode === 229) return;
      event.stopPropagation();
      close.current?.();
    };
    const { body, documentElement } = document;
    const held = [body.style.overflow, documentElement.style.overflow];
    document.addEventListener("keydown", key);
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      body.style.overflow = held[0];
      documentElement.style.overflow = held[1];
    };
  }, [picture]);

  if (!picture) return null;

  // The shape to hold the box in, and the size past which enlarging it stops
  // buying anything: a 2048px photo stretched across a 4K window is the same
  // picture blurred. Both handed to CSS rather than measured here, so the box
  // follows a window being resized or a phone being turned without a listener.
  const ratio = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : null;

  return (
    <div
      className={styles.overlay}
      // Anywhere off the picture puts it away, which on a phone is most of the
      // screen. The picture itself is deliberately not a way out: a reader
      // looking closely at a photograph should be able to press it without
      // losing it, and the cross in the corner is there for anyone who would
      // rather aim at something.
      onClick={() => close.current?.()}
      role="dialog"
      aria-modal="true"
      aria-label={t("post.photoTitle")}
    >
      <button type="button" className={styles.close} aria-label={t("post.photoClose")}>
        ✕
      </button>
      <img
        className={ratio ? `${styles.image} ${styles.sized}` : styles.image}
        style={ratio ? { "--ratio": ratio, "--natural": `${photo.width}px` } : undefined}
        // Nothing to read out that the post it came from does not already say,
        // and the reader pressed this picture to get here.
        src={src || undefined}
        alt=""
        onClick={(event) => event.stopPropagation()}
      />
      {/* Only while the photograph is still coming — what is on screen until
          then is the thumbnail, which is the right picture and not the whole of
          it, and a viewer that said nothing would look simply soft. */}
      {!loaded && <p className={styles.loading}>{t("common.loading")}</p>}
    </div>
  );
}
