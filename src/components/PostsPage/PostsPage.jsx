import { Suspense, lazy, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal } from "../../ui/index.js";
import { formatUsername } from "../../utils/format.js";
import { filterBy } from "../../utils/search.js";
import { useAuth } from "../AuthProvider/index.js";
import Header from "../Header/index.js";
import PostItem from "../PostItem/index.js";
import PostPreview from "../PostPreview/index.js";
import SearchField from "../SearchField/index.js";
import { useHere } from "../LocationProvider/index.js";

// For the same reason the other two pages load it lazily: mapbox-gl is by far
// the heaviest thing lo ships.
const MapCard = lazy(() => import("../MapCard/MapCard.jsx"));

// The marks page, asking the other question. Marks are yours and are a history,
// so that page is a map of where you have been; posts are everyone's and are a
// present tense, so this one is a map of what is around you now — same split,
// same rows, and the list underneath is the half of it you can read.
export default function PostsPage() {
  const { t } = useTranslation();
  // The list itself belongs to the provider: it is asked for again when the
  // ground changes and when the refresh in the top bar is pressed, neither of
  // which this page is in a position to notice.
  const { coords, posts, postsError, dropPost } = useHere();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
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

  // The words, where they were left, and who left them — the three things a
  // row says, and the three a post is remembered by. The name is folded in as
  // it is written on the row, @ and all, so searching for @someone finds them
  // the way they were read.
  const shown = useMemo(
    () => filterBy(posts, query, (post) => [post.body, post.place, formatUsername(post.username)]),
    [posts, query],
  );

  return (
    <div className="page-shell posts-page">
      <Header back />
      <div className="posts-map">
        <Suspense fallback={<div className="posts-map-placeholder" />}>
          {/* Filtered with the list, for the reason the marks map is */}
          <MapCard fitMarks posts={shown} focus={focus} onSelectPost={setPreviewing} />
        </Suspense>
      </div>
      <main className="posts-list">
        <div className="section-heading">
          <div className="section-heading-titles">
            <h1>{t("posts.title")}</h1>
            <p className="section-subtitle">{t("posts.subtitle")}</p>
          </div>
          <span>{query.trim() ? `${shown.length}/${posts.length}` : posts.length}</span>
        </div>
        {posts.length > 0 && (
          <SearchField value={query} onChange={setQuery} placeholder={t("search.posts")} />
        )}
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
                onOpen={setPreviewing}
                onDelete={setDeleting}
                // A fresh object every time rather than the post itself: the map
                // pans on a new `focus`, and asking twice for the same spot —
                // after wandering off it — has to move the map twice.
                onShowOnMap={(target) => setFocus({ ...target })}
              />
            ))}
          </ul>
        )}
        {/* A failed fetch and a failed delete both land here. Without the first
            of them the page would answer a broken request with "nothing around
            here", which is a different thing entirely. */}
        {(error || postsError) && <p className="list-error">{error || postsError.message}</p>}
      </main>

      <PostPreview
        post={previewing}
        from={coords}
        onClose={() => setPreviewing(null)}
        onDelete={(post) => {
          setPreviewing(null);
          setDeleting(post);
        }}
      />

      <Modal
        isOpen={Boolean(deleting)}
        title={t("post.deleteTitle")}
        onClose={() => setDeleting(null)}
        closeOnOverlay
      >
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
