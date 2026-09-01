import { useTranslation } from "react-i18next";
import { showToast } from "../../ui/index.js";
import { copyText } from "../../utils/clipboard.js";
import { formatAccuracy, formatCoords, relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./here.module.css";

// Folded on both sides before they are compared, the same way search folds a
// query: the two names come from the same geocoder but not always in the same
// case or width.
function fold(text) {
  return text.normalize("NFKC").toLowerCase();
}

// The answer to the question the whole app is built around, stated once at the
// top so no card has to repeat it.
export default function HereStrip() {
  const { t, i18n } = useTranslation();
  const { coords, place, status, stale, at, loadingLocal } = useHere();
  if (!coords) return null;

  const name = place?.name || t("location.title");
  // The region is on the line to say where the place is, so it comes off the
  // line when the place has already said it. The server drops a region that is
  // the name exactly; this drops the ones that only contain it — Kyoto under
  // "préfecture de Kyoto", which is the same word read twice and, in French,
  // long enough to want a second line the strip has not got (see the
  // stylesheet).
  const region = place?.region && !fold(place.region).includes(fold(name)) ? place.region : null;
  const detail = [place?.locality && place.locality !== place?.name ? place.locality : null, region]
    .filter(Boolean)
    .join(" · ");
  const coordinateText = formatCoords(coords.latitude, coords.longitude);

  async function copyCoordinates() {
    const copied = await copyText(coordinateText);
    showToast(t(copied ? "location.coordinatesCopied" : "location.coordinatesCopyFailed"), 1800);
  }

  return (
    <section className={styles.strip} aria-label={t("location.title")}>
      <div className={styles.names}>
        <h1 className={styles.place}>{name}</h1>
        {/* This line stands whether or not there is anything on it. It is the
            top of the page and the entire dashboard hangs off its bottom edge,
            so a line that only appeared once the server had named the place
            would push the whole grid down a notch under the reader's eye. While
            that answer is in the air it holds a bar, the same as the cards
            below; answered by a place with nothing to add — a locality that is
            its own name, no region — or not answered at all, it is an empty
            line of the height it would have had. */}
        <p className={styles.detail}>
          {detail ||
            (loadingLocal && !place ? <span className={styles.pending} aria-hidden="true" /> : null)}
        </p>
      </div>
      <dl className={styles.readout}>
        <div>
          <dt className="sr-only">{t("location.title")}</dt>
          <dd>
            <button
              type="button"
              className={styles.coordinates}
              title={t("location.copyCoordinates")}
              aria-label={t("location.copyCoordinates")}
              onClick={copyCoordinates}
            >
              {coordinateText}
            </button>
          </dd>
        </div>
        <div>
          <dt className="sr-only">{t("location.accuracy")}</dt>
          <dd>
            {formatAccuracy(coords.accuracy)}
            {formatAccuracy(coords.accuracy) && " · "}
            {status === "locating"
              ? t("location.locating")
              : stale
                ? t("location.stale")
                : t("location.updated", { time: relativeTime(new Date(at).toISOString(), i18n.language, t) })}
          </dd>
        </div>
      </dl>
    </section>
  );
}
