import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { ActionButton, Card, Skeleton } from "../../ui/index.js";
import { formatDistance } from "../../utils/format.js";
import {
  holdRadioTile,
  nextStation,
  prevStation,
  shownStation,
  toggleRadio,
  tuneRadio,
  useRadio,
} from "../../utils/radio.js";
import { useHere } from "../LocationProvider/index.js";
import CardSize from "../CardSize/index.js";
import RadioWave from "./RadioWave.jsx";
import styles from "./radio.module.css";

// The server ranks a whole country and answers for a neighbourhood of it, so
// the request is keyed as coarsely as the answer changes (see lookupRadio).
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(1)},${coords.longitude.toFixed(1)}`;
}

// The face of the set: live sound in the square, the station's name under it,
// and the three buttons a radio has ever needed — back a station, play or stop,
// on a station. Place and distance live together in the heading's corner, where
// the clock wears its zone, leaving the whole body to the station itself.
//
// What is deliberately not on the tile is a list. Eight verified stations
// stand behind the one shown, walked either way from the buttons nearest
// first, and one at a time is the whole design: a radio has one dial and
// plays one thing. The sound itself lives in utils/radio.js rather than here —
// the card is a face on the tuner, not the tuner.
export default function RadioCard() {
  const { t } = useTranslation();
  const { coords, reloadToken } = useHere();
  const radio = useRadio();
  const [error, setError] = useState(null);
  // True from the first render rather than from the first effect — see the same
  // line in NewsCard: an empty face a frame before the request goes out would
  // read as "no stations here".
  const [loading, setLoading] = useState(() => Boolean(coords));
  const requestRef = useRef(0);

  const key = coordKey(coords);

  // No language in the dependencies: a station's name is its own in every one
  // of lo's, and the server ranks against the place rather than the reader.
  useEffect(() => {
    if (!coords) return;
    const ticket = ++requestRef.current;
    setLoading(true);
    api
      .getRadio(coords)
      .then((data) => {
        if (ticket !== requestRef.current) return;
        // The one filter the server cannot apply: a plain-http stream is a row
        // the browser will refuse on an https page — mixed content — and a
        // station that cannot sound here is not a station here. On http, and
        // in the Even Hub's WebView with it, the rows stand.
        const https = window.location.protocol === "https:";
        tuneRadio(
          (data?.items ?? []).filter(
            (row) => row.listenUrl || !https || !row.url.startsWith("http:"),
          ),
        );
        setError(null);
      })
      .catch((requestError) => {
        if (ticket !== requestRef.current) return;
        setError(requestError);
      })
      .finally(() => {
        if (ticket === requestRef.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadToken]);

  // While this tile stands the sound may keep coming; when the last one goes
  // the tuner is switched off behind it (see holdRadioTile).
  useEffect(() => holdRadioTile(), []);

  const shown = shownStation(radio);
  const sounding = radio.status === "on" || radio.status === "tuning";
  const meta = shown
    ? [
        shown.place,
        Number.isFinite(shown.metres) ? formatDistance(shown.metres).replace(/\s+/g, "") : null,
      ]
        .filter(Boolean)
        .join(" · ") || null
    : null;

  let body;
  if (!shown && loading) {
    body = <Skeleton rows={2} label={t("radio.loading")} />;
  } else if (!shown && error) {
    body = <p className={styles.empty}>{t("radio.unavailable")}</p>;
  } else if (!shown) {
    body = <p className={styles.empty}>{t("radio.empty")}</p>;
  } else {
    body = (
      <div className={styles.inner}>
        <div className={styles.tuner}>
          {/* The station's sound is the face now: a live monochrome trace set in
              the same kind of measured instrument as the clock and direction
              dials. It settles to a hairline while quiet or tuning rather than
              inventing movement before the stream has spoken. */}
          <RadioWave active={sounding} />
          {/* The station's name and nothing else. The tuner used to caption
              itself here — "no signal" for a stream that would not answer, and
              a word for tuning before that — but a line that appears and goes
              is a flicker rather than a reading, and it moved the name under it
              every time. What the set is doing is already said by the two marks
              a reader is looking at: the button showing play rather than stop,
              and a drawing holding its centre line. */}
          <p className={styles.station}>
            <span className={styles.name}>{shown.name}</span>
          </p>
          {/* Back, play or stop, on. The pair at the sides are spent rather
              than hidden when there is only the one station to be on (see
              CardSize, whose rule this is): a control that comes and goes
              moves the play button under the reader's finger. */}
          <div className={styles.controls}>
            {/* The pair are the player's own skip marks — a triangle against a
                bar, the triangle drawn to the play button's beside them — not
                chevrons, which at this size say "page" rather than "station". */}
            <ActionButton
              aria-label={t("radio.prev")}
              disabled={radio.stations.length < 2}
              onClick={prevStation}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6l-8 6 8 6z" />
                <path d="M6 6v12" />
              </svg>
            </ActionButton>
            <ActionButton aria-label={t(sounding ? "radio.stop" : "radio.play")} onClick={toggleRadio}>
              {sounding ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 6l12 6-12 6z" />
                </svg>
              )}
            </ActionButton>
            <ActionButton
              aria-label={t("radio.next")}
              disabled={radio.stations.length < 2}
              onClick={nextStation}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l8 6-8 6z" />
                <path d="M18 6v12" />
              </svg>
            </ActionButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    // Flush, and the radio spends its own margin instead. The card's body gives
    // a pixel more above than at the sides — nothing anyone sees around a
    // paragraph, and the difference between lined up and not once a drawing runs
    // the full width of the tile and has the other two margins to answer to.
    <Card title={t("radio.title")} meta={meta} action={<CardSize id="radio" />} square flush>
      <div className={styles.body}>{body}</div>
    </Card>
  );
}
