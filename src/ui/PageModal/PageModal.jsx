import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import Modal from "../Modal/index.js";
import Skeleton from "../Skeleton/index.js";
import styles from "./page.module.css";

// A story read here, over the dashboard, rather than in a tab somewhere else.
//
// It reads the words rather than the page. Framing the page was the obvious
// answer and it does not work: newspapers send X-Frame-Options and
// frame-ancestors, so a sheet built on an iframe shows the browser's apology
// about as often as it shows an article — and there is no cross-origin way to
// find out which you are about to get. So the server takes the text out of the
// page and keeps it (see server/articles.js), and this shows three things: the
// headline, when it was published, and the story.
//
// What it does not show is everything else that was on that page, which is most
// of the argument for doing it this way at all — the sheet opens at lo's speed,
// carries none of the publisher's trackers, and reads the same whatever the
// story came off.
//
// The way through to the original stays in the top bar, and is the whole answer
// for the rows this cannot do: a paywalled story arrives as its opening
// paragraph and says so.
export default function PageModal({ url, title, source, time, kind, onClose, onUnreadable }) {
  const { t, i18n } = useTranslation();
  const [article, setArticle] = useState(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  // The caller's callback, held in a ref so it can stay out of the effect's
  // dependencies below: a list hands over a fresh arrow function on every render,
  // and in the dependencies that would re-ask for the story the sheet is already
  // showing every time the card behind it re-rendered.
  const report = useRef(onUnreadable);
  report.current = onUnreadable;

  useEffect(() => {
    if (!url) return;
    const ticket = ++request.current;
    setArticle(null);
    setFailed(false);
    api
      .getArticle({ url, title, source, kind })
      .then((data) => {
        if (ticket === request.current) setArticle(data);
      })
      .catch((error) => {
        // Nothing was got — a publisher that will not answer a server, a story
        // whose address would not resolve. Not an error to apologise for, just
        // a sheet whose only content is the way out to the page itself.
        if (ticket !== request.current) return;
        setFailed(true);
        // And the list is told, so that the row behind this sheet can say from
        // now on that it goes out to the publisher rather than opening here.
        //
        // Only on the server's own "there is no reading for this one", which is
        // the 404: a timeout or a server that could not be reached is this
        // moment's news about lo, not a lasting fact about the story, and a row
        // marked on the strength of one would be telling the reader something
        // untrue about where it goes. The server writes the same thing down when
        // it is the story that is at fault and says so on its next answer; this
        // is for the reader who found it out first (see withReadings in
        // server/index.js).
        if (error?.status === 404) report.current?.(url);
      });
  }, [url, title, source, kind]);

  if (!url) return null;

  // The publisher's own address once the server has resolved it, so the link out
  // goes to the article rather than through Google's redirect.
  const origin = article?.url || url;
  const published = article?.published || time;

  let body;
  if (failed) {
    body = <p className={styles.note}>{t("reader.unavailable")}</p>;
  } else if (!article) {
    body = <Skeleton rows={6} label={t("reader.loading")} />;
  } else {
    body = (
      <>
        {article.paragraphs.map((line, index) => (
          // The paragraphs are the story in order and nothing else identifies
          // them, so their position is the key — the list never reorders.
          // eslint-disable-next-line react/no-array-index-key
          <p key={index} className={styles.paragraph}>
            {line}
          </p>
        ))}
        {/* Said at the end rather than the top, because it is only worth saying
            once the reader has run out of story: what arrived was the opening of
            a piece somebody wants paying for, and the rest is on their site. */}
        {article.partial && (
          <p className={styles.note}>
            {article.paywalled ? t("reader.paywalled") : t("reader.partial")}
          </p>
        )}
      </>
    );
  }

  // Out to the body, because every caller is a row inside a tile and the tile is
  // a query container: containment makes it the containing block for anything
  // fixed inside it, and the sheet would be laid out across that one square
  // instead of across the window. See MarkButton, which learned the same thing.
  return createPortal(
    <Modal
      isOpen
      onClose={onClose}
      // What the sheet is, not what is in it. A headline is a sentence and the
      // top bar is a label beside a close button: set there it had to be cut to
      // an ellipsis, which is the one place a headline must not be cut. So the
      // bar says what kind of thing this is, and the headline goes where it can
      // have the room and the wrapping it needs — the top of the reading, which
      // is where a story keeps its title anyway.
      title={t("reader.title")}
      closeOnOverlay
      large
      header={
        <a className={styles.away} href={origin} target="_blank" rel="noreferrer noopener">
          {article?.source || source || t("reader.open")}
          <span aria-hidden="true"> ↗</span>
        </a>
      }
    >
      <article className={styles.article}>
        {/* Straight away, from the row that was pressed, and replaced by the
            publisher's own wording if the two differ once the story lands: the
            sheet should never be sitting there anonymous while it loads. */}
        <h2 className={styles.headline}>{article?.title || title}</h2>
        {published && (
          <time className={styles.when} dateTime={published}>
            {new Date(published).toLocaleString(i18n.language, {
              dateStyle: "long",
              timeStyle: "short",
            })}
          </time>
        )}
        {body}
      </article>
    </Modal>,
    document.body,
  );
}

// Spread onto the row that opens the sheet, the way directionsLink is spread
// onto the control that opens Maps. The row stays a real anchor with a real
// href, so it still hovers like a link, still copies like one, and still opens
// in a tab for anyone who asks for that with cmd, ctrl, shift or the middle
// button — only the plain left click is taken, and taken here.
export function sheetLink(url, open) {
  return {
    href: url,
    target: "_blank",
    rel: "noreferrer noopener",
    onClick: (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open();
    },
  };
}
