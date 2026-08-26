import { useTranslation } from "react-i18next";
import { Card, Link } from "../../ui/index.js";
import { distanceMeters, formatDistance, formatUsername, relativeTime } from "../../utils/format.js";
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
// There is still no page for a person in lo, but there is one question a row can
// answer that the row itself cannot: what have they left around here. So a row
// presses through to the posts page with @them already in the search field,
// which is the same filter a reader could have typed there by hand — the panel
// only saves them the typing, and the field it lands in says so.
//
// An anchor rather than a button, so a row opens in its own tab like every other
// pressable row on the dashboard.
export default function PeopleCard() {
  const { t, i18n } = useTranslation();
  const { coords, people } = useHere();

  // Nearest first, and with the distance each row shows in hand. Without a fix
  // of our own there is no distance to sort on, and the order the server sent —
  // most recently seen first — is the better one anyway.
  const rows = people
    .map((person) => ({
      person,
      away: coords ? distanceMeters(coords, person) : Infinity,
    }))
    .sort((a, b) => a.away - b.away);

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
      meta={people.length > 0 ? String(people.length) : null}
      wide
      half
      flush
      // `panel-trail` is the page's hook for the last of the panels — on a wide
      // screen it goes to the end of the run, which puts it right of the trends
      // list and under the posts panel (see .card-grid in styles.css).
      className="panel-trail"
    >
      <div className={styles.scroll}>
        {rows.length === 0 ? (
          <p className={styles.empty}>{t("people.empty")}</p>
        ) : (
          <ul className={styles.list}>
            {rows.map(({ person, away }) => (
              <li key={person.username}>
                <Link
                  to={`/posts?author=${encodeURIComponent(person.username)}`}
                  className={styles.item}
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
        )}
      </div>
    </Card>
  );
}
