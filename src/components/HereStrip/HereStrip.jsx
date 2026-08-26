import { useTranslation } from "react-i18next";
import { formatAccuracy, formatCoords, relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./here.module.css";

// The answer to the question the whole app is built around, stated once at the
// top so no card has to repeat it.
export default function HereStrip() {
  const { t, i18n } = useTranslation();
  const { coords, place, status, stale, at, loadingLocal } = useHere();
  if (!coords) return null;

  const name = place?.name || t("location.title");
  const detail = [place?.locality && place.locality !== place?.name ? place.locality : null, place?.region]
    .filter(Boolean)
    .join(" · ");

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
          <dd>{formatCoords(coords.latitude, coords.longitude)}</dd>
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
