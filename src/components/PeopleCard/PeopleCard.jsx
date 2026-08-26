import { useTranslation } from "react-i18next";
import { Card } from "../../ui/index.js";
import { distanceMeters, formatDistance, formatUsername, relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./people.module.css";

// Who else has a tab open around here, as a list — the ringed dots on the map
// above, read rather than looked at. The map says where each of them is; this
// says who they are and how far off, in the order that matters when the question
// is "is anybody near me" — nearest first, which is the one order a map of
// scattered dots cannot put them in.
//
// The list is the provider's, traded for our own fix on the minute loop, so the
// panel costs no request of its own.
//
// Rows lead nowhere: there is no page for a person in lo, and the dot on the map
// is already the whole of what is known about one. So this is type, not links.
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
              <li key={person.username} className={styles.item}>
                {/* The dot the map draws them with, off the map: grey, ringed,
                    and the same size, so a row and its marker read as the same
                    person without a legend saying so. */}
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.who}>{formatUsername(person.username)}</span>
                <span className={styles.itemMeta}>
                  {Number.isFinite(away) && <span>{formatDistance(away)}</span>}
                  {/* A position is only worth as much as its age — a dot ten
                      minutes old is somebody who has already walked off. */}
                  <time dateTime={person.time}>{relativeTime(person.time, i18n.language, t)}</time>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
