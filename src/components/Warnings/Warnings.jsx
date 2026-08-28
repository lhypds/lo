import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Modal, Skeleton } from "../../ui/index.js";
import { relativeTime } from "../../utils/format.js";
import { formatWarningWindow, warningKindKey, warningLevel } from "../../utils/warnings.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./warnings.module.css";

// What Yahoo! 防災速報 would have pushed to a phone standing here: the 特別警報,
// 警報 and 注意報 in force for this municipality. Japan only — the server says as
// much, and the card takes itself off the dashboard rather than claiming an all
// clear it has no way of knowing.
//
// The answer is per municipality, and the server rounds the fix onto one before
// asking, so the request is keyed as coarsely as that: two decimals, ~1.1 km.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(2)},${coords.longitude.toFixed(2)}`;
}

// What the row is standing on, by how far up 警戒レベル it is: yellow at 3, where
// a 警報 is in force, red at 4 and 5, where the country's advice stops being
// "watch this" and becomes "leave". Below that nothing — an advisory is the
// card's ordinary weather, and a list where every row is coloured has no voice
// left to raise. Read off the level rather than the band, because the level is
// what the colour is about: the two top bands share a colour here, and it is the
// number at the end of the row that says which of them this is.
function levelClass(level) {
  if (level >= 4) return styles.grave;
  if (level === 3) return styles.warned;
  return undefined;
}

export default function Warnings() {
  const { t, i18n } = useTranslation();
  const { coords, reloadToken } = useHere();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // True from the first render rather than from the first effect — see the
  // same line in NewsCard. It matters most here: "nothing in force" is the one
  // sentence on the dashboard nobody should read before it has been asked.
  const [loading, setLoading] = useState(() => Boolean(coords));
  // Which warning is open in full. Unlike the news card this opens nothing from
  // anywhere: Yahoo's bulletin is a table, not prose, and lo has already parsed
  // it — so the sheet is the row with the parts the tile had to cut. Chiefly the
  // area list, which a square shows eight of and a prefecture-wide warning may
  // have sixty. Held by index because two rows can name the same hazard at
  // different strengths.
  const [reading, setReading] = useState(null);
  const requestRef = useRef(0);

  const key = coordKey(coords);

  useEffect(() => {
    if (!coords) return;
    const ticket = ++requestRef.current;
    setLoading(true);
    api
      .getWarnings(coords)
      .then((data) => {
        if (ticket !== requestRef.current) return;
        setResult(data);
        setError(null);
      })
      .catch((requestError) => {
        if (ticket !== requestRef.current) return;
        setError(requestError);
      })
      .finally(() => {
        if (ticket === requestRef.current) setLoading(false);
      });
    // Alone among the cards this one does not ask again when the language
    // changes: Yahoo answers in Japanese either way, and every word the card can
    // translate it translates here. The token it does follow — of everything on
    // the dashboard this is the one worth pressing refresh for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadToken]);

  // Somewhere Yahoo has nothing to say about — the card is not a card here.
  // Kept until the first answer arrives so the tile does not appear and vanish.
  if (result && !result.covered) return null;

  const items = result?.items ?? [];
  // The row the sheet is open on, and the two things it says that the tile had
  // to cut short. Worked out here rather than in the sheet so the whole of what
  // it needs is one place, and so an index left over from a previous answer —
  // the list is refetched every five minutes — closes the sheet instead of
  // opening it on the wrong warning.
  const open = reading == null ? null : (items[reading] ?? null);
  const openWindow = open ? formatWarningWindow(open.from, open.to, i18n.language) : null;
  const openAreas = open
    ? (open.areaNames?.length ? open.areaNames : [result?.area].filter(Boolean))
    : [];

  let body;
  if (loading && !result) {
    body = <Skeleton rows={3} label={t("warnings.loading")} />;
  } else if (error) {
    body = <p className={styles.note}>{t("warnings.unavailable")}</p>;
  } else if (items.length === 0) {
    body = <p className={styles.note}>{t("warnings.empty")}</p>;
  } else {
    body = (
      <ul className={styles.list}>
        {items.map((item, index) => {
          const kindKey = warningKindKey(item.name);
          const itemKey = `${item.severity}:${item.name}:${index}`;
          const areaNames = item.areaNames?.length ? item.areaNames : [result.area].filter(Boolean);
          const areaPreview = areaNames.slice(0, 8).join("、");
          const remainingAreas = areaNames.length - 8;
          const level = warningLevel(item.severity);
          // Only the municipality answer carries a window, and only for a hazard
          // the outlook table has a row for — the rest of the rows go without.
          const outlook = formatWarningWindow(item.from, item.to, i18n.language);
          return (
            <li key={itemKey} className={levelClass(level)}>
              {/* The row itself opens the warning in full: three words and a
                  clock cannot carry everything the bulletin says, and a warning
                  is not the place to make a reader hunt for the rest of it. */}
              <button type="button" className={styles.item} onClick={() => setReading(index)}>
                <span className={styles.row}>
                  {/* Filled for anything at warning strength, hollow for an
                      advisory: the word beside it is the claim, this is only what
                      the eye catches first. */}
                  <span
                    className={item.severity === "advisory" ? styles.markHollow : styles.mark}
                    aria-hidden="true"
                  />
                  <span className={styles.kind}>{kindKey ? t(kindKey) : item.name}</span>
                  {/* What is said about the weather named to the left of it, as
                      one group at the right end of the row rather than three
                      things each finding their own way there. A group because on
                      a square the row is allowed to wrap: sent separately, the
                      level was the one that went over, and a number alone on a
                      second line reads as a row of its own rather than as the end
                      of this one. Together they go over together, and stay hard
                      right wherever they land. */}
                  <span className={styles.said}>
                    {/* A wider answer, because the fix had no local warning — so
                        each row says how much of that wider area it covers. */}
                    {item.areas != null && (
                      <span className={styles.areas}>
                        {item.areas}/{result.areaCount}
                      </span>
                    )}
                    <span className={styles.severity}>
                      {t(`warnings.severity.${item.severity}`)}
                    </span>
                    {/* 警戒レベル, the number the country's evacuation advice is
                        written against — the word beside it says what was issued,
                        this says how far up the scale it is. */}
                    {level != null && (
                      <span className={styles.level}>{t("warnings.level", { level })}</span>
                    )}
                  </span>
                </span>
                <span className={styles.detail}>
                  {/* From when until when it is forecast to stay this strong, on
                      Tokyo's clock. An end the forecast never reaches is left
                      open, because the outlook running out is not the warning
                      lifting. */}
                  {outlook && (
                    <time className={styles.outlook} dateTime={item.from}>
                      {outlook.to
                        ? t("warnings.window", { from: outlook.from, to: outlook.to })
                        : t("warnings.windowOpen", { from: outlook.from })}
                    </time>
                  )}
                  {areaPreview && (
                    <span>
                      {areaPreview}
                      {remainingAreas > 0 ? ` +${remainingAreas}` : ""}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card
      title={t("warnings.title")}
      // One of the six fixed opening cubes: warnings no longer carries resize
      // controls or a wider panel state.
      square
      flush
      className={styles.square}
    >
      <div className={styles.inner}>
        <div className={styles.scroll}>{body}</div>
        {/* When it was said, which on this card is half the answer: an hour-old
            bulletin may have been lifted since. The way through to the reading
            behind it is the row itself. */}
        {result?.issuedAt && (
          <p className={styles.issued}>
            <time dateTime={result.issuedAt}>
              {t("warnings.issued", { time: relativeTime(result.issuedAt, i18n.language, t) })}
            </time>
          </p>
        )}
      </div>
      {open && (
        <Modal
          isOpen
          onClose={() => setReading(null)}
          closeOnOverlay
          title={warningKindKey(open.name) ? t(warningKindKey(open.name)) : open.name}
          header={
            <a
              className={styles.away}
              href={result.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Yahoo!<span aria-hidden="true"> ↗</span>
            </a>
          }
        >
          <dl className={styles.sheet}>
            <dt>{t("warnings.sheet.severity")}</dt>
            <dd>
              {t(`warnings.severity.${open.severity}`)}
              {warningLevel(open.severity) != null &&
                ` · ${t("warnings.level", { level: warningLevel(open.severity) })}`}
            </dd>
            {openWindow && (
              <>
                <dt>{t("warnings.sheet.outlook")}</dt>
                <dd>
                  {openWindow.to
                    ? t("warnings.window", { from: openWindow.from, to: openWindow.to })
                    : t("warnings.windowOpen", { from: openWindow.from })}
                </dd>
              </>
            )}
            {/* The reason this sheet exists. A prefecture-wide warning can name
                sixty municipalities and the tile has room for eight — here they
                are all listed, because "is my town on it" is the question a
                warning is actually being read to answer. */}
            {openAreas.length > 0 && (
              <>
                <dt>
                  {t("warnings.sheet.areas")}
                  {open.areas != null && ` (${open.areas}/${result.areaCount})`}
                </dt>
                <dd>{openAreas.join("、")}</dd>
              </>
            )}
            {result.issuedAt && (
              <>
                <dt>{t("warnings.sheet.issued")}</dt>
                <dd>
                  <time dateTime={result.issuedAt}>
                    {new Date(result.issuedAt).toLocaleString(i18n.language, {
                      dateStyle: "long",
                      timeStyle: "short",
                    })}
                  </time>
                </dd>
              </>
            )}
          </dl>
        </Modal>
      )}
    </Card>
  );
}
