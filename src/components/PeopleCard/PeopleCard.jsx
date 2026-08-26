import { useTranslation } from "react-i18next";
import { Card, Link, Skeleton } from "../../ui/index.js";
import { distanceMeters, formatDistance, formatUsername, relativeTime } from "../../utils/format.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
import { openProfile } from "../UserModal/userApi.js";
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
// by leaving the dashboard to answer it. Now there is a person to open instead:
// the sheet says who they are, how to reach them, what they have posted, and
// carries the one thing you can do about somebody, which is say something to
// them. The dashboard stays where it is underneath.
//
// Still an anchor, and still pointing at the profile's own page: a plain press
// opens the sheet over the dashboard, and a middle click or a held modifier does
// what it does to every other row here and opens the person in their own tab.
//
// The sheet itself belongs to the top bar rather than to this tile, and is asked
// for by name — every card on the dashboard is a size container, and a container
// is a containing block for anything fixed inside it, so a sheet opened in here
// would be centred in a 175px tile.
export default function PeopleCard() {
  const { t, i18n } = useTranslation();
  const { coords, people, loadingPeople } = useHere();
  const { user } = useAuth();

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
      title={t("people.nearby")}
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
      wide
      half
      flush
    >
      <div className={styles.scroll}>
        <ul className={styles.list}>
          {me && (
            <li>
              <Link
                to={`/u/${encodeURIComponent(me.username)}`}
                className={styles.item}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  openProfile(me.username);
                }}
              >
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
              <Link
                to={`/u/${encodeURIComponent(person.username)}`}
                className={styles.item}
                // Refusing the navigation is what Link reads as "handled": the
                // sheet is the answer to a plain press. A held modifier means the
                // reader asked for a tab or a window, so those are let through to
                // the browser and land on the profile's page.
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  openProfile(person.username);
                }}
              >
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
