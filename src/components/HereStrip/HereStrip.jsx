import { useTranslation } from "react-i18next";
import { formatAccuracy, formatCoords, relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./here.module.css";

// The answer to the question the whole app is built around, stated once at the
// top so no card has to repeat it.
export default function HereStrip() {
  const { t, i18n } = useTranslation();
  const { coords, place, status, stale, at } = useHere();
  if (!coords) return null;

  const name = place?.name || t("location.title");
  const detail = [place?.locality && place.locality !== place?.name ? place.locality : null, place?.region]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className={styles.strip} aria-label={t("location.title")}>
      <div className={styles.names}>
        <h1 className={styles.place}>{name}</h1>
        {detail && <p className={styles.detail}>{detail}</p>}
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
