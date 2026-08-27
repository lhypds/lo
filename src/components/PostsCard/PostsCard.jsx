import { useTranslation } from "react-i18next";
import { Card, Link, Skeleton } from "../../ui/index.js";
import { LARGE, SMALL, TALL, useCardSize } from "../../utils/cards.js";
import { distanceMeters, formatCoords, formatDistance, formatUsername, relativeTime } from "../../utils/format.js";
import CardSize from "../CardSize/index.js";
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
  const { coords, posts, loadingPosts } = useHere();
  // How tall the reader has left it, anywhere from two squares to six. A list
  // panel is the kind of tile that is worth another row on some days and not on
  // others, which is what the pair of buttons in the heading is for: how many
  // posts are around here is the street's answer and how much of the page they
  // are worth is the reader's.
  const size = useCardSize("posts");

  return (
    <Card
      // "nearby", not the page's bare "posts": the dashboard is a page of
      // answers about where you are standing, and this one is only the posts
      // within reach of it — the page it leads to is the whole list.
      title={t("posts.nearby")}
      // How many there are. The panel is a window onto a list that scrolls, so
      // the figure is the thing the rows on screen cannot say for themselves:
      // whether there are four posts around here or forty. The distance that
      // stood here before was already on every row — how close a post is, is
      // about one post, and it belongs beside the one it is about.
      //
      // Nothing rather than a nought, as on the people panel: the line under the
      // heading is about to say there is nothing around here in words.
      meta={posts.length || null}
      action={<CardSize id="posts" />}
      wide
      half={size === SMALL}
      square={size === LARGE}
      tall={size === TALL}
      flush
    >
      <div className={styles.scroll}>
        {/* Waiting is not the same answer as none: the list belongs to the
            provider and arrives a moment after the tile does, and "no posts
            around here yet" said in that moment would be a claim about the
            street rather than about the request. */}
        {posts.length === 0 ? (
          loadingPosts ? (
            <Skeleton rows={4} label={t("common.loading")} />
          ) : (
            <p className={styles.empty}>{t("posts.empty")}</p>
          )
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
