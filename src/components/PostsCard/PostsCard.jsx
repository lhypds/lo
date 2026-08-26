import { useTranslation } from "react-i18next";
import { Card, Link } from "../../ui/index.js";
import { distanceMeters, formatCoords, formatDistance, formatUsername, relativeTime } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./posts.module.css";

// What people have left around here, as a list — the same answer the map beside
// it is drawing, read rather than looked at. The squares on the map say where a
// post is and the bubble says what it is; this says what there is, in the order
// it was written, which is the one thing a map cannot show.
//
// The list is the provider's, already in hand for the map, so the panel costs no
// request of its own.
//
// A row leads to the posts page rather than opening anything here: that page is
// this list with room to breathe and a map that pans to whichever post is asked
// for, and the id goes with the link so it arrives on the one that was pressed.
// An anchor rather than a button, so the row can be opened in its own tab like
// any other link on the dashboard.
export default function PostsCard() {
  const { t, i18n } = useTranslation();
  const { coords, posts } = useHere();

  // How far the nearest one is, where a count used to be. How many there are is
  // something the list answers by being scrolled; how close the closest is, is
  // the thing the panel can say and the list cannot — a post 30 m away is worth
  // looking up from the screen for, one 4 km away is somebody else's street.
  // It is not the first row either: the list is in the order the posts were
  // written, so the nearest can be anywhere in it.
  const nearest = coords
    ? posts.reduce((least, post) => Math.min(least, distanceMeters(coords, post)), Infinity)
    : Infinity;

  return (
    <Card
      // "nearby", not the page's bare "posts": the dashboard is a page of
      // answers about where you are standing, and this one is only the posts
      // within reach of it — the page it leads to is the whole list.
      title={t("posts.nearby")}
      meta={Number.isFinite(nearest) ? formatDistance(nearest) : null}
      wide
      square
      flush
    >
      <div className={styles.scroll}>
        {posts.length === 0 ? (
          <p className={styles.empty}>{t("posts.empty")}</p>
        ) : (
          <ul className={styles.list}>
            {posts.map((post) => (
              <li key={post.id}>
                <Link to={`/posts?post=${post.id}`} className={styles.item}>
                  {/* Square and cropped, as in the list on the posts page: a row
                      is the same height whichever way the photo was held. */}
                  {post.image && (
                    <img className={styles.thumb} src={post.image} alt="" loading="lazy" width="32" height="32" />
                  )}
                  <span className={styles.lines}>
                    {/* A photo with no words is a whole post; where it was taken
                        stands in for the words it does not have. */}
                    <span className={styles.itemTitle}>
                      {post.body || post.place || formatCoords(post.latitude, post.longitude)}
                    </span>
                    <span className={styles.itemMeta}>
                      <span className={styles.who}>{formatUsername(post.username)}</span>
                      <time dateTime={post.time}>{relativeTime(post.time, i18n.language, t)}</time>
                      {coords && <span>{formatDistance(distanceMeters(coords, post))}</span>}
                    </span>
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
