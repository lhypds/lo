import { useTranslation } from "react-i18next";
import { Card, Link, Skeleton } from "../../ui/index.js";
import { SMALL, TINY, useCardSize } from "../../utils/cards.js";
import { distanceMeters, formatDistance, formatUsername, relativeTime } from "../../utils/format.js";
import { useAuth } from "../AuthProvider/index.js";
import CardSize from "../CardSize/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./people.module.css";

// Who else has a tab open around here, as a list — and the only place they are
// shown at all: the map draws the ground and the reader standing on it, not
// everyone else. Type answers "is anybody near me" better than a scatter of
// dots did anyway, because it can be ordered — nearest first, with a name and a
// distance on every row.
//
// The list is the provider's, traded for our own fix on the minute loop, so the
// panel costs no request of its own.
//
// A row used to press through to the posts page with @them in the search field,
// which answered one question about a person — what have they left around here —
// by leaving the dashboard to answer it. Now it goes to the person: /<name>
// says who they are, how to reach them, what they have posted, and carries the
// one thing you can do about somebody, which is say something to them.
//
// A plain link, and nothing held back from it. There was a sheet over the
// dashboard here for a while, opened by the same press and leaving the page
// underneath; a person turned out to be one answer and not two, so the page is
// all of it — which is what a middle click or a held modifier was already
// reaching for, and is a thing that can be kept, shared or opened in a tab.
export default function PeopleCard() {
  const { t, i18n } = useTranslation();
  const { coords, people, loadingPeople } = useHere();
  const { user } = useAuth();
  const size = useCardSize("people");

  // Nearest first, and with the distance each row shows in hand. Without a fix
  // of our own there is no distance to sort on, and the order the server sent —
  // most recently seen first — is the better one anyway.
  const rows = people
    .map((person) => ({
      person,
      away: coords ? distanceMeters(coords, person) : Infinity,
    }))
    .sort((a, b) => a.away - b.away);

  // You, at the top of it. The list is who is around here and you are one of
  // them — the panel read as a list of everyone but the reader, which is the one
  // person on it there is no doubt about.
  //
  // Built here rather than sent by the server, which leaves the asker out on
  // purpose: your own position comes off your own sensor, and that is fresher
  // than the same fix would be after a round trip through the server that only
  // hears about it once a minute. So the row carries no distance and no age —
  // both are zero, and "0.0 m · just now" would be three ways of saying "here".
  const me = user && coords ? { username: user.username } : null;

  return (
    <Card
      // "nearby", as on the posts panel above it: the dashboard answers about
      // the ground you are standing on, and these are the people within reach
      // of it — not everyone who has ever signed in.
      //
      // The one word on its own at a square, where the phrase does not fit: a
      // heading is 12px of monospace, so it costs what its characters cost, and
      // three words plus the pair of size buttons are wider than the narrowest
      // phone's tile — the count would have been squeezed out of the heading to
      // make room for a name the tile was going to cut short anyway. Which word
      // to keep is not a close call: the rows are names, and a square of them
      // sitting in the block of tiles beside the map is about as plainly "near
      // here" as a tile on this page can be. The phrase comes back with the
      // width to hold it, and the menu lists the card under the phrase.
      title={size === TINY ? t("people.short") : t("people.nearby")}
      // A count, where the posts panel puts a distance. Presence is a handful of
      // open tabs and the nearest one is the first row, so the distance would
      // only say twice what the list already says; how many there are at all is
      // the thing worth knowing before the list is read — and the answer is
      // often none.
      //
      // Everyone the list holds, your own row included: a figure that counted
      // the rows differently from the way they are drawn would be the panel
      // arguing with itself.
      meta={rows.length + (me ? 1 : 0) || null}
      action={<CardSize id="people" />}
      // The three sizes as the card sees them: a single square, the panel column
      // one tile tall, and that column twice as tall (see utils/cards.js). A
      // square is where this one starts, and at a square it is a list of names
      // beside the block of tiles rather than a panel under it — which is the
      // whole reason it can be on the page before anybody asks for it.
      wide={size !== TINY}
      half={size === SMALL}
      square={size !== SMALL}
      flush
      // At a square the rows are trimmed to what fits one (see people.module.css)
      className={size === TINY ? styles.square : undefined}
    >
      <div className={styles.scroll}>
        <ul className={styles.list}>
          {me && (
            <li>
              <Link to={`/${encodeURIComponent(me.username)}`} className={styles.item}>
                {/* Filled where the others are grey, which is the whole of what
                    the row has to add: this one is you. */}
                <span className={`${styles.dot} ${styles.dotSelf}`} aria-hidden="true" />
                <span className={styles.who}>{formatUsername(me.username)}</span>
                <span className={styles.itemMeta}>
                  <span>{t("people.you")}</span>
                </span>
              </Link>
            </li>
          )}
          {rows.map(({ person, away }) => (
            <li key={person.username}>
              <Link to={`/${encodeURIComponent(person.username)}`} className={styles.item}>
                {/* A bullet for the row — a person is somewhere, and a small
                    grey disc says that before the name is read. */}
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.who}>{formatUsername(person.username)}</span>
                <span className={styles.itemMeta}>
                  {Number.isFinite(away) && <span>{formatDistance(away)}</span>}
                  {/* A position is only worth as much as its age — a dot ten
                      minutes old is somebody who has already walked off. */}
                  <time dateTime={person.time}>{relativeTime(person.time, i18n.language, t)}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {/* Under your own row rather than instead of the list, which is never
            empty now that you are on it. It is still worth saying: a panel
            showing one name could be read as one that failed to load the rest,
            and "who else is around" is the question this is here to answer.
            Until the first trade comes back that is exactly what a panel
            showing one name would be, so the bars stand in the meantime and
            the sentence waits until it is true. */}
        {rows.length === 0 &&
          (loadingPeople ? (
            <Skeleton rows={3} lines={1} label={t("common.loading")} className={styles.waiting} />
          ) : (
            <p className={styles.empty}>{t("people.empty")}</p>
          ))}
      </div>
    </Card>
  );
}
