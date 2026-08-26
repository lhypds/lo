import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Skeleton, showToast } from "../../ui/index.js";
import { getLocationState, refreshLocation } from "../../utils/location.js";
import ClockCard from "../../components/ClockCard/index.js";
import Header from "../../components/Header/index.js";
import HereStrip from "../../components/HereStrip/index.js";
import LocationGate from "../../components/LocationGate/index.js";
import MarkButton from "../../components/MarkButton/index.js";
import NewsCard from "../../components/NewsCard/index.js";
import PeopleCard from "../../components/PeopleCard/index.js";
import PostModal from "../../components/PostModal/index.js";
import PostsCard from "../../components/PostsCard/index.js";
import TrendsCard from "../../components/TrendsCard/index.js";
import Warnings from "../../components/Warnings/index.js";
import WeatherCard from "../../components/WeatherCard/index.js";
import { useHere } from "../../components/LocationProvider/index.js";

// mapbox-gl is by far the heaviest thing lo loads, and the login and gate
// screens both come before any map — so it is fetched only once there is a
// position worth drawing.
const MapCard = lazy(() => import("../../components/MapCard/MapCard.jsx"));

export default function HomePage() {
  const { t } = useTranslation();
  // Posts come from the provider rather than from here: they are a reading of
  // the fix, like the place name is, and the refresh in the top bar has to be
  // able to reach them without knowing which page it is sitting on.
  const { coords, place, posts, addPost, supports, reloadToken } = useHere();
  // Held here, not in the map: expanding it hides the rest of the dashboard.
  const [mapExpanded, setMapExpanded] = useState(false);
  const [marks, setMarks] = useState([]);
  // The fix the hold was made on, which is also what says the sheet is open —
  // a post belongs to the spot its writer was standing on when they started it,
  // not to wherever they have drifted by the time they press Post.
  const [composing, setComposing] = useState(null);

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
  //
  // But the sheet does not wait on it. That request is high-accuracy and refuses
  // a cached fix, so it is a live reading of the sensor: iOS keeps its radio warm
  // and answers in about the time it takes to lift a finger, and Android has to
  // start the GPS and takes seconds over it. Waiting on it before opening made
  // the hold look broken on Android — the sheet arrived so long after the press
  // that it read as having been opened by letting go.
  //
  // So the sheet opens on the fix already in hand and the fresh one lands under
  // it. Nothing is lost by that: what the post is filed under is read at submit,
  // which is minutes of writing away, and the line at the top settles to the
  // better fix while the first words are still being typed.
  async function compose() {
    if (!coords) {
      showToast(t("mark.needsLocation"));
      return;
    }
    setComposing(coords);
    await refreshLocation().catch(() => {});
    // Read back from the store, since `coords` here is the one this render
    // closed over — exactly the position just superseded. A sheet already closed
    // again is left closed: this answer belongs to a press that is over.
    const fresh = getLocationState().coords;
    if (fresh) setComposing((open) => (open ? fresh : open));
  }

  function created(post) {
    setComposing(null);
    // Straight onto the map rather than through a refetch: the writer is
    // looking at the spot they just posted about.
    addPost(post);
    showToast(t("post.posted"), 1800);
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
            <Suspense
              fallback={
                // The map's own card, drawn by the page while mapbox-gl is
                // still on the wire: the tile that lands here is a titled
                // square, so the thing holding its place has to be one too or
                // the grid rearranges itself around the heaviest thing it is
                // waiting for.
                <Card title={t("map.title")} square flush quietHead>
                  <Skeleton fill label={t("common.loading")} />
                </Card>
              }
            >
              {/* Everything that is here: the posts whoever came past left, the
                  spots you kept, and you standing among them. The marks page
                  answers a different question — where have I been, in order —
                  which is why that one carries a list and this one does not. */}
              <MapCard
                posts={posts}
                marks={marks}
                expanded={expanded}
                onToggleExpanded={() => setMapExpanded((value) => !value)}
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
              you have seen where you are standing. It is half the grid wide, so
              on a phone it lands on the row below the map's own — the four
              squares stay a block, and the panels start here. On a wide screen
              it is pinned to the right half instead, beneath the news and above
              the trends: everything the country itself has to say, in one
              column (see .card-grid in styles.css). */}
          {supports("warnings") && <Warnings />}
          {/* One panel off both feeds now, and it stands if either of them can
              be fed: an edition that covers the news but has no event listing
              still has something to say about the place. */}
          {(supports("nearby") || supports("events")) && <NewsCard />}
          {/* Posts are lo's own and belong to no country, so this one is
              unconditional — the same reason the mark button is. It reads the
              list the map above it is already drawing. */}
          <PostsCard />
          {/* Who else is around, under the list of what people left. The map
              draws the posts but not the people — presence is the half of it
              that reads as type, a name with how far off and how long ago.
              Unconditional for the same reason the posts are: presence is lo's
              own and stops at no border. */}
          <PeopleCard />
          {supports("trends") && <TrendsCard />}
        </div>
      </main>

      {/* Outside <main>, which is emptied down to the map while it is expanded:
          the hold that opens this can be made on the full-screen map too.
          Reading a post needs nothing out here — the bubble on its own square
          says the whole of it — and rewriting or taking one down is done from the
          list on the posts page, where every post of yours is in one place. */}
      <PostModal
        isOpen={Boolean(composing)}
        coords={composing}
        place={place ? [place.locality, place.name, place.region].filter(Boolean).join(" · ") : ""}
        onClose={() => setComposing(null)}
        onCreated={created}
      />
    </div>
  );
}
