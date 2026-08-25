import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal, showToast } from "../../ui/index.js";
import { getLocationState } from "../../utils/location.js";
import ClockCard from "../ClockCard/index.js";
import EventsCard from "../EventsCard/index.js";
import Header from "../Header/index.js";
import HereStrip from "../HereStrip/index.js";
import LocationGate from "../LocationGate/index.js";
import MarkButton from "../MarkButton/index.js";
import NearbyCard from "../NearbyCard/index.js";
import PostModal from "../PostModal/index.js";
import PostPreview from "../PostPreview/index.js";
import TrendsCard from "../TrendsCard/index.js";
import WeatherCard from "../WeatherCard/index.js";
import { useHere } from "../LocationProvider/index.js";

// mapbox-gl is by far the heaviest thing lo loads, and the login and gate
// screens both come before any map — so it is fetched only once there is a
// position worth drawing.
const MapCard = lazy(() => import("../MapCard/MapCard.jsx"));

// Two decimals is about a kilometre, the same grain the location provider asks
// the server questions on: posts are fetched for the ground around the reader,
// and walking down the street does not change which ground that is.
function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(2)},${coords.longitude.toFixed(2)}`;
}

export default function HomePage() {
  const { t } = useTranslation();
  const { coords, place, refresh } = useHere();
  // Held here, not in the map: expanding it hides the rest of the dashboard.
  const [mapExpanded, setMapExpanded] = useState(false);
  const [posts, setPosts] = useState([]);
  // The fix the hold was made on, which is also what says the sheet is open —
  // a post belongs to the spot its writer was standing on when they started it,
  // not to wherever they have drifted by the time they press Post.
  const [composing, setComposing] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadPosts = useCallback(() => {
    api
      .getPosts(getLocationState().coords)
      .then((data) => setPosts(data.posts))
      // A map short of a few pins is still a map; there is nothing here the
      // reader could do about it either.
      .catch(() => {});
  }, []);

  const key = coordKey(coords);
  useEffect(() => {
    if (!key) return;
    loadPosts();
  }, [key, loadPosts]);

  // A hold is also a request for a current position, the same way a tap on the
  // same button is: the post is pinned to the freshest fix the device can give.
  // That fix is read back from the store, since `coords` here is the one this
  // render closed over — exactly the position just superseded.
  async function compose() {
    if (!coords) {
      showToast(t("mark.needsLocation"));
      return;
    }
    await refresh().catch(() => {});
    setComposing(getLocationState().coords ?? coords);
  }

  function created(post) {
    setComposing(null);
    // Straight onto the map rather than through a refetch: the writer is
    // looking at the spot they just posted about.
    setPosts((current) => [post, ...current]);
    showToast(t("post.posted"), 1800);
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await api.deletePost(deleting.id);
      setPosts((current) => current.filter((post) => post.id !== deleting.id));
      setDeleting(null);
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false);
    }
  }

  // Nothing below answers a question without a position, so the gate stands in
  // for the whole dashboard rather than appearing inside it.
  if (!coords) return <LocationGate />;

  return (
    <div className="page-shell home-page">
      <Header />
      {/* Everything but the map is hidden rather than unmounted while it is
          expanded, so collapsing back does not refetch the news or reset what
          the mark button knows about this spot. */}
      <main
        className={mapExpanded ? "home-main home-main-map" : "home-main"}
        aria-label={t("location.title")}
      >
        <HereStrip />
        <div className="card-grid">
          <ClockCard />
          <WeatherCard />
          <Suspense fallback={<div className="card-placeholder" />}>
            {/* No saved marks on this one: the dashboard map answers where you
                are now, and where you have been is the marks page's question.
                Posts are neither — they are what is here, left by whoever came
                past, so this is the map they belong on. */}
            <MapCard
              posts={posts}
              expanded={mapExpanded}
              onToggleExpanded={() => setMapExpanded((value) => !value)}
              onSelectPost={setPreviewing}
            />
          </Suspense>
          <MarkButton onLongPress={compose} />
          <NearbyCard />
          <EventsCard />
          <TrendsCard />
        </div>
      </main>

      {/* Outside <main>, which is emptied down to the map while it is expanded:
          a post can be opened from the full-screen map too. */}
      <PostModal
        isOpen={Boolean(composing)}
        coords={composing}
        place={place ? [place.locality, place.name, place.region].filter(Boolean).join(" · ") : ""}
        onClose={() => setComposing(null)}
        onCreated={created}
      />

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
