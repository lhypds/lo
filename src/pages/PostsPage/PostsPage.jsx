import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Lightbox, Modal, showToast, useSearchParams } from "../../ui/index.js";
import { formatUsername } from "../../utils/format.js";
import { postPhoto } from "../../utils/image.js";
import { filterBy } from "../../utils/search.js";
import { DEFAULT_SORT, sortRows } from "../../utils/sort.js";
import { useAuth } from "../../components/AuthProvider/index.js";
import CommentsModal from "../../components/CommentsModal/index.js";
import Header from "../../components/Header/index.js";
import PostItem from "../../components/PostItem/index.js";
import PostModal from "../../components/PostModal/index.js";
import SearchField from "../../components/SearchField/index.js";
import SortField from "../../components/SortField/index.js";
import { useNearbyPosts } from "../../components/LocationProvider/index.js";

// For the same reason the other two pages load it lazily: mapbox-gl is by far
// the heaviest thing lo ships.
const MapCard = lazy(() => import("../../components/MapCard/MapCard.jsx"));

// The marks page, asking the other question. Marks are yours and are a history,
// so that page is a map of where you have been; posts are everyone's and are a
// present tense, so this one is a map of what is around you now — same split,
// same rows, and the list underneath is the half of it you can read.
export default function PostsPage() {
  const { t } = useTranslation();
  // The list itself belongs to the provider: it is asked for again when the
  // ground changes and when the refresh in the top bar is pressed, neither of
  // which this page is in a position to notice. Asking through useNearbyPosts is
  // what gets it fetched at all — a page that is nothing but posts is one of the
  // two things in lo that draws them, and nothing is fetched on behalf of a
  // reader who is not looking at either (see LocationProvider).
  const { coords, posts, postsError, dropPost, replacePost } = useNearbyPosts();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  // Arriving with one person in mind: the name comes over on the URL and the
  // field opens with @them in it. A starting value and not a filter of its own —
  // the query is the reader's from the first keystroke, so they can widen it,
  // narrow it, or clear it like any other, and what the page is showing them is
  // written where they can see it rather than held somewhere off screen.
  //
  // The dashboard's list of people used to be what sent readers here that way.
  // It opens the person themselves now, and it is their page that asks the
  // question instead: a post pressed on a profile arrives with ?post= to say
  // which one and ?author= to say whose, so the map lands on the post and the
  // list around it is the rest of what that person left rather than the whole
  // neighbourhood.
  //
  // Which is also the whole of what the page knows about where its reader came
  // from, and so is what the back button goes on: a name in ?author= means a
  // profile sent them, and back from a post read on somebody's page is that
  // person's page rather than the dashboard. It stays the way back even after
  // the field has been widened or cleared — the button is about the trip here,
  // not about what is on the map now. Without the name — the dashboard's posts
  // panel presses through with ?post= alone — the page is the whole
  // neighbourhood's and back is home, as before.
  //
  // Home is bare "/", even for a reader who came off page three of the
  // dashboard: which page they were standing on is the dashboard's own to
  // remember, and it does (see utils/pages.js).
  const author = searchParams.get("author");
  const backTo = author ? `/${encodeURIComponent(author)}` : "/";
  const [query, setQuery] = useState(() => (author ? formatUsername(author) : ""));
  // Newest first, which is the order the list arrives in and the one this page is
  // for: posts are a present tense, and what was left a minute ago belongs at the
  // top of them.
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [focus, setFocus] = useState(null);
  // The post the pointer is resting on, from whichever half of the page it is
  // resting on it — the same two-way pairing the marks page makes, for the same
  // reason: the square on the map and the row in the list are one post.
  const [hovered, setHovered] = useState(null);
  // And the one they have chosen — the same pairing the marks page makes: the map
  // holds the choice, the page only shows which row it was.
  const [chosen, setChosen] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  // The post whose remarks are open over the page, from the count in the corner
  // of its bubble on the map. Held here rather than in the card: the map is
  // inside a container-sized tile, which would be the containing block of any
  // fixed box mounted in it.
  const [commenting, setCommenting] = useState(null);
  // And the post whose photograph is being looked at, from the picture in the
  // same bubble. Held here for the reason the remarks are: the viewer covers the
  // window, and a fixed box mounted inside the map would be laid out against the
  // container-sized tile the map is in rather than against the window.
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.deletePost(deleting.id);
      dropPost(deleting.id);
      setDeleting(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  // Arriving from the dashboard's panel with one post in mind: the row there
  // presses through to here, and the map opens on the post it was. Once only —
  // the list is asked for again whenever the ground moves, and a page that
  // re-panned on every answer would keep taking the view back off the reader.
  const wanted = searchParams.get("post");
  const arrivedRef = useRef(false);
  useEffect(() => {
    if (arrivedRef.current || !wanted) return;
    const target = posts.find((post) => String(post.id) === wanted);
    if (!target) return;
    arrivedRef.current = true;
    setFocus({ ...target });
  }, [wanted, posts]);

  // The words, where they were left, and who left them — the three things a
  // row says, and the three a post is remembered by. The name is folded in as
  // it is written on the row, @ and all, so searching for @someone finds them
  // the way they were read; and handed over on its own besides, which is what
  // makes a query that starts with @ a question about the author rather than
  // about anyone who happened to be named in the words.
  //
  // Ordered after it is narrowed, as on the marks page: the same answer either
  // way, over however many rows the search has left standing.
  const shown = useMemo(
    () =>
      sortRows(
        filterBy(
          posts,
          query,
          (post) => [post.body, post.place, formatUsername(post.username)],
          (post) => post.username,
        ),
        sort,
        coords,
      ),
    [posts, query, sort, coords],
  );

  return (
    <div className="page-shell posts-page">
      <Header back backTo={backTo} cards />
      <div className="posts-map">
        <Suspense fallback={<div className="posts-map-placeholder" />}>
          {/* Filtered with the list, for the reason the marks map is */}
          {/* The edit and the delete in a square's bubble open the very sheets
              the row's own two buttons open — one composer, one confirmation,
              whichever half of the page they were asked for from. The map hands
              them out on the reader's own posts only; on anyone else's, the
              bubble is what it always was. */}
          <MapCard
            fitMarks
            posts={shown}
            focus={focus}
            hovered={hovered}
            onHoverPin={setHovered}
            onSelectPin={setChosen}
            onOpenComments={setCommenting}
            onOpenPhoto={setViewing}
            onEditPost={setEditing}
            onDeletePost={setDeleting}
          />
        </Suspense>
      </div>
      <main className="posts-list">
        {/* The heading and the search stay put while the list scrolls under them
            — held out of the scroller below rather than stuck to its top, so the
            list's own overscroll bounce cannot drag them down. */}
        <div className="list-sticky">
          <div className="section-heading">
            <div className="section-heading-titles">
              <h1>{t("posts.title")}</h1>
              <p className="section-subtitle">{t("posts.subtitle")}</p>
            </div>
            <span>{query.trim() ? `${shown.length}/${posts.length}` : posts.length}</span>
          </div>
          {posts.length > 0 && (
            <div className="list-tools">
              <SearchField value={query} onChange={setQuery} placeholder={t("search.posts")} />
              {/* These posts are the ones around the reader, so there is always a
                  there to be near — but the menu is asked the same question the
                  marks page asks it, rather than assuming an answer. */}
              <SortField value={sort} onChange={setSort} near={Boolean(coords)} />
            </div>
          )}
        </div>
        <div className="list-scroll">
          {posts.length === 0 ? (
            <p className="empty-state">{t("posts.empty")}</p>
          ) : shown.length === 0 ? (
            <p className="empty-state">{t("search.empty", { query: query.trim() })}</p>
          ) : (
            <ul className="post-list">
              {shown.map((post) => (
                <PostItem
                  key={post.id}
                  post={post}
                  from={coords}
                  mine={Boolean(user && post.username === user.username)}
                  hovered={post.id === hovered}
                  chosen={post.id === chosen}
                  onHover={setHovered}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                  // Pressing the row opens that post's bubble up on the map, the
                  // way pressing a mark's name does — but without moving the
                  // ground under it. This map opens over the whole scatter of
                  // what is around you, and the list is the index to it: a row
                  // pressed is "which one is that?", not "take me there", and a
                  // map that flew to the pin answered a question by throwing
                  // away the picture that made it worth asking. `still` is that
                  // request; the map still comes when the pin is off screen,
                  // where there is no view to keep (see MapCard).
                  //
                  // A fresh object every time rather than the post itself: the
                  // map acts on a new `focus`, and asking twice for the same
                  // spot — after wandering off it — has to answer twice.
                  onShowOnMap={(target) => setFocus({ ...target, still: true })}
                />
              ))}
            </ul>
          )}
          {/* A failed fetch and a failed delete both land here. Without the first
              of them the page would answer a broken request with "nothing around
              here", which is a different thing entirely. */}
          {(error || postsError) && <p className="list-error">{error || postsError.message}</p>}
        </div>
      </main>

      {/* The composer again, opened on a post that already exists. Rewriting one
          is the same act as writing it — the same words, the same photo, the same
          sheet — and the spot and the moment it was left at are not up for
          revision, so nothing here asks for a fix. */}
      <PostModal
        isOpen={Boolean(editing)}
        post={editing}
        onClose={() => setEditing(null)}
        onSaved={(post) => {
          setEditing(null);
          // Into the provider's list, which the map and the rows both read: the
          // author is looking at the post they have just rewritten.
          replacePost(post);
          // The row it lands in may be well down a long list, and the sheet
          // closing is not by itself an answer about whether the save went
          // through — the same reason writing one says so.
          showToast(t("post.saved"), 1800);
        }}
      />

      {/* What everyone who came past had to say about one post. The count that
          opens it is in the corner of the bubble on the map, and adding a remark
          hands the new figure back through the provider — the pins are redrawn
          from that list, so the corner is right again the moment the sheet
          closes. */}
      <CommentsModal
        post={commenting}
        onClose={() => setCommenting(null)}
        onAdded={(post, comments) => replacePost({ ...post, comments })}
      />

      {/* The photograph, over everything. The picture in a bubble is a thumbnail
          cropped to a band — enough to know a post by, not enough to look at —
          and this is what pressing it opens. It stands out here with the sheets
          rather than in the map for their reason: it covers the window, and the
          map is inside a tile that would be the containing block of any fixed
          box mounted in it. */}
      <Lightbox photo={postPhoto(viewing)} onClose={() => setViewing(null)} />

      <Modal isOpen={Boolean(deleting)} title={t("post.deleteTitle")} onClose={() => setDeleting(null)} closeOnOverlay>
        <p className="modal-text">{t("post.deleteConfirm")}</p>
        <div className="modal-actions">
          <button type="button" className="outline-button" onClick={() => setDeleting(null)} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary-button" onClick={confirmDelete} disabled={busy}>
            {busy ? t("post.deleting") : t("post.delete")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
