import { useTranslation } from "react-i18next";
import { Card, Link, Skeleton } from "../../ui/index.js";
import { distanceMeters, formatCountry, formatDistance, formatUsername, relativeTime } from "../../utils/format.js";
import { useAuth } from "../../components/AuthProvider/index.js";
import { useHere } from "../../components/LocationProvider/index.js";
import CardSize from "../../components/CardSize/index.js";
import styles from "./people.module.css";

// Who else has a tab open around here, as a list — and the only place they are
// shown at all: the map draws the ground and the reader standing on it, not
// everyone else. Type answers "is anybody near me" better than a scatter of
// dots did anyway, because it can be ordered — nearest first, with a name and a
// reading of where they are on every row.
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

// Past this the number has stopped being an answer. Under it a distance places
// somebody — the next street, the far side of town, an hour on a train — and
// over it every figure says the same thing, which is "not here": 1,160 km and
// 8,140 km are one fact read twice, and neither of them is the fact worth having
// about somebody that far off. Whereabouts they are is.
//
// Five hundred kilometres because that is about where the two readings change
// places. A person 300 km away is somewhere you could be tonight; a person 900
// km away is somewhere else, and the name of the somewhere else is the whole of
// what the row can usefully say.
const FAR_M = 500_000;

// What a row says about where somebody is: how far, or whereabouts — never both,
// since the tile has one slot for it and a place beside a number would be the row
// answering twice.
//
// Whereabouts is the region and the country: "Kyōto-fu · Japan", which says the
// thing a reader wants off a name they have found halfway around the world. Both
// in the reader's own language — the country because the browser can name a code
// in any of them, the region because the server annotates the list in the
// language it was asked in.
//
// The country drops out of it when it is the reader's own, which is what keeps
// the swap from making the row worse: somebody 3,000 km from Shanghai is in
// Xinjiang, and saying so is worth more than "China" and more than 3,000 km,
// where saying so about somebody in Japan would leave off the half that matters.
// The region drops out when the geocoder has not named it yet — a country on its
// own is still an answer — and where neither is known the distance stands,
// because a figure that says little is better than a row that says nothing.
function whereabouts(away, person, home, locale) {
  if (!Number.isFinite(away)) return "";
  if (away >= FAR_M) {
    const abroad = person.country && person.country.toUpperCase() !== home;
    const line = [person.region, abroad ? formatCountry(person.country, locale) : ""]
      .filter(Boolean)
      .join(" · ");
    if (line) return line;
  }
  return formatDistance(away);
}

export default function PeopleCard() {
  const { t, i18n } = useTranslation();
  const { coords, place, people, loadingPeople } = useHere();
  const { user } = useAuth();

  // Which country the reader is standing in, off the same lookup the place name
  // in the top bar comes from. Unknown until it lands, and unknown reads as "not
  // the same country" — a row would rather name a country it turns out the
  // reader is also in than show a figure that says nothing.
  const home = (place?.countryCode ?? "").toUpperCase();

  // Nearest first, and with the reading each row shows in hand. Without a fix
  // of our own there is no distance to sort on, and the order the server sent —
  // most recently seen first — is the better one anyway.
  const rows = people
    .map((person) => {
      const away = coords ? distanceMeters(coords, person) : Infinity;
      return { person, where: whereabouts(away, person, home, i18n.language), away };
    })
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
  //
  // Unless the reader has taken themselves off the list (see the account sheet),
  // in which case the row goes with everybody else's copy of it. The switch says
  // "do not show me among the people here", and a panel that went on showing the
  // one name it drew itself would be answering a different question from the one
  // that was asked.
  const me = user && coords && user.discoverable !== false ? { username: user.username } : null;

  return (
    <Card
      // One of the six fixed opening cubes. Its longer menu label remains
      // "Nearby people"; the cube itself needs only the noun beside the count.
      title={t("people.short")}
      // A count, as on the posts panel. Presence is a handful of open tabs and
      // the nearest one is the first row, so a distance up here would only say
      // twice what the list already says; how many there are at all is the thing
      // worth knowing before the list is read — and the answer is often none.
      //
      // Everyone the list holds, your own row included: a figure that counted
      // the rows differently from the way they are drawn would be the panel
      // arguing with itself.
      meta={rows.length + (me ? 1 : 0) || null}
      action={<CardSize id="people" />}
      square
      flush
      // The rows are trimmed to what fits the fixed cube (see people.module.css).
      className={styles.square}
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
          {rows.map(({ person, where }) => (
            <li key={person.username}>
              <Link to={`/${encodeURIComponent(person.username)}`} className={styles.item}>
                {/* A bullet for the row — a person is somewhere, and a small
                    grey disc says that before the name is read. */}
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.who}>{formatUsername(person.username)}</span>
                <span className={styles.itemMeta}>
                  {where && <span>{where}</span>}
                  {/* A position is only worth as much as its age — a dot ten
                      minutes old is somebody who has already walked off. */}
                  <time dateTime={person.time}>{relativeTime(person.time, i18n.language, t)}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {/* Bars under your own row until the first trade comes back, because a
            panel showing one name could be read as one that failed to load the
            rest. Ruled underneath like the rows they stand in for — but only
            where there is a row above them to continue; hidden, they are the
            whole of the tile and a line under them would close off nothing. */}
        {rows.length === 0 && loadingPeople && (
          <Skeleton
            rows={3}
            lines={1}
            label={t("common.loading")}
            className={me ? styles.waiting : undefined}
          />
        )}
        {/* And in words once the trade is back and there is nobody. Nothing to
            say this while your own row stands — a sentence saying nobody is here
            under a name would be the panel arguing with itself — so it is the
            answer only to a reader who has taken that row off. */}
        {rows.length === 0 && !loadingPeople && !me && (
          <p className={styles.empty}>{t("people.empty")}</p>
        )}
      </div>
    </Card>
  );
}
