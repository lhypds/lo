import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal, showToast } from "../../ui/index.js";
import { getLocationState, refreshLocation } from "../../utils/location.js";
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
import Warnings from "../Warnings/index.js";
import WeatherCard from "../WeatherCard/index.js";
import { useHere } from "../LocationProvider/index.js";

// mapbox-gl is by far the heaviest thing lo loads, and the login and gate
// screens both come before any map — so it is fetched only once there is a
// position worth drawing.
const MapCard = lazy(() => import("../MapCard/MapCard.jsx"));

export default function HomePage() {
  const { t } = useTranslation();
  // Posts come from the provider rather than from here: they are a reading of
  // the fix, like the place name is, and the refresh in the top bar has to be
  // able to reach them without knowing which page it is sitting on.
  const { coords, place, posts, addPost, dropPost, supports, reloadToken } = useHere();
  // Held here, not in the map: expanding it hides the rest of the dashboard.
  const [mapExpanded, setMapExpanded] = useState(false);
  const [marks, setMarks] = useState([]);
  // The fix the hold was made on, which is also what says the sheet is open —
  // a post belongs to the spot its writer was standing on when they started it,
  // not to wherever they have drifted by the time they press Post.
  const [composing, setComposing] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  // Marks are yours and are the same list wherever you are standing, so unlike
  // posts they are not asked for again on every move — only on the refresh in
  // the top bar, which is where a list changed on another device comes in. The
  // button below keeps this in step in between: a spot marked on this page
  // should appear on the map on this page, not on the next reload.
  useEffect(() => {
    api
      .getMarks()
      .then((data) => setMarks(data.marks))
      .catch(() => {});
  }, [reloadToken]);

  // A hold is also a request for a current position, the same way a tap on the
  // same button is: the post is pinned to the freshest fix the device can give.
  // That fix is read back from the store, since `coords` here is the one this
  // render closed over — exactly the position just superseded.
  async function compose() {
    if (!coords) {
      showToast(t("mark.needsLocation"));
      return;
    }
    await refreshLocation().catch(() => {});
    setComposing(getLocationState().coords ?? coords);
  }

  function created(post) {
    setComposing(null);
    // Straight onto the map rather than through a refetch: the writer is
    // looking at the spot they just posted about.
    addPost(post);
    showToast(t("post.posted"), 1800);
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await api.deletePost(deleting.id);
      dropPost(deleting.id);
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

  // A fix that has crossed into a country with no map must not leave the page
  // expanded onto one — the expanded layout empties out everything else.
  const expanded = mapExpanded && supports("map");

  return (
    <div className="page-shell home-page">
      <Header />
      {/* Everything but the map is hidden rather than unmounted while it is
          expanded, so collapsing back does not refetch the news or reset what
          the mark button knows about this spot. */}
      <main
        className={expanded ? "home-main home-main-map" : "home-main"}
        aria-label={t("location.title")}
      >
        <HereStrip />
        {/* Which of these the country can feed is the server's answer, and a card
            it cannot feed is left out rather than left empty: an empty Trends
            card would read as "nobody here is searching for anything". Only the
            mark button is unconditional — it is lo's own, and standing somewhere
            is not a thing any country can fail to support. */}
        <div className="card-grid">
          {supports("clock") && <ClockCard />}
          {supports("weather") && <WeatherCard />}
          {supports("map") && (
            <Suspense fallback={<div className="card-placeholder" />}>
              {/* Everything that is here: the posts whoever came past left, the
                  spots you kept, and you standing among them. The marks page
                  answers a different question — where have I been, in order —
                  which is why that one carries a list and this one does not. */}
              <MapCard
                posts={posts}
                marks={marks}
                expanded={expanded}
                onToggleExpanded={() => setMapExpanded((value) => !value)}
                onSelectPost={setPreviewing}
              />
            </Suspense>
          )}
          <MarkButton
            onLongPress={compose}
            onMarked={(mark) => setMarks((current) => [mark, ...current])}
            onUnmarked={(mark) => setMarks((current) => current.filter((item) => item.id !== mark.id))}
            onRenamed={(mark) =>
              setMarks((current) => current.map((item) => (item.id === mark.id ? mark : item)))
            }
          />
          {/* Under the map rather than over it: a warning is about the ground
              the map is drawing, and it reads as a caption on that ground once
              you have seen where you are standing. It is the full width of the
              grid, so it lands on the row below the map's own — the four
              squares stay a block, and the panels start here. */}
          {supports("warnings") && <Warnings />}
          {supports("nearby") && <NearbyCard />}
          {supports("events") && <EventsCard />}
          {supports("trends") && <TrendsCard />}
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
