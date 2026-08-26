import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Skeleton, showToast } from "../../ui/index.js";
import { useCards } from "../../utils/cards.js";
import { getLocationState, refreshLocation } from "../../utils/location.js";
import ClockCard from "../../components/ClockCard/index.js";
import EventsCard from "../../components/EventsCard/index.js";
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
  // Which cards are on the page. Both halves of that in one question — what this
  // country can feed and what the reader has kept — so the grid below asks once
  // per card rather than twice (see utils/cards.js). The plus in the top bar is
  // the other end of it.
  const { shown } = useCards(supports);
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
  // expanded onto one, and neither must a reader who has just taken the map off
  // the page — the expanded layout empties out everything else.
  const expanded = mapExpanded && shown("map");

  return (
    <div className="page-shell home-page">
      <Header cards />
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
            card would read as "nobody here is searching for anything". Which of
            the rest are worth the room is the reader's, through the plus in the
            top bar — `shown` is both answers at once. Only the mark button is
            unconditional: it is lo's own, standing somewhere is not a thing any
            country can fail to support, and a dashboard you can take every tile
            off should still let you keep where you are. */}
        <div className="card-grid">
          {shown("clock") && <ClockCard />}
          {shown("weather") && <WeatherCard />}
          {shown("map") && (
            <Suspense
              fallback={
                // The map's own card, drawn by the page while mapbox-gl is
                // still on the wire: the tile that lands here is a titled
                // square, so the thing holding its place has to be one too or
                // the grid rearranges itself around the heaviest thing it is
                // waiting for.
                <Card title={t("map.title")} square flush>
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
          {/* Last of the four squares, which on a two-column grid is the one to
              the right of the map: the ground you are standing on first and the
              one thing you can do about it after it — the button is the corner
              the block ends on. */}
          <MarkButton
            onLongPress={compose}
            onMarked={(mark) => setMarks((current) => [mark, ...current])}
            onUnmarked={(mark) => setMarks((current) => current.filter((item) => item.id !== mark.id))}
            onRenamed={(mark) =>
              setMarks((current) => current.map((item) => (item.id === mark.id ? mark : item)))
            }
          />
          {/* Then lo's own two, ahead of everything the country has to say —
              the warnings, the news and the trending list all come after them.
              What somebody left on this street and who is standing on it are the
              nearest things on the page, and the only two that can change while
              it is open; the rest is a slower reading of a wider place. Somebody
              who opened lo to see where they are should not have to scroll past
              a headline to find out who is next to them.

              A phone reads this as the order it is written in. A wide screen
              does not read it as an order at all — these two keep the left
              column and everything the country says keeps the right, whichever
              way round they are written here (see .card-grid in styles.css).

              How much room each of them takes is the reader's and is asked for
              by the card itself, not decided here: the people card starts at a
              single square and joins the block of tiles above, and the posts
              panel starts at the width of the panel column and begins a row of
              its own under it (see utils/cards.js).

              Posts are lo's own and belong to no country, so no country is asked
              about this one — the same reason the mark button is unconditional.
              It reads the list the map above it is already drawing. */}
          {shown("posts") && <PostsCard />}
          {/* Who else is around, under the list of what people left. The map
              draws the posts but not the people — presence is the half of it
              that reads as type, a name with how far off and how long ago. No
              country is asked about this one either: presence is lo's own and
              stops at no border, which is also why it can be on the page from
              the first visit: a square of names is the answer to "is anybody
              near me", and there is nowhere lo runs where that has no answer. */}
          {shown("people") && <PeopleCard />}
          {/* Still under the map, which is the half of the page a warning is
              about: it reads as a caption on that ground once you have seen
              where you are standing. Under lo's own panels as well now, which is
              a judgement about distance rather than about weight — what is on
              this street is nearer than what is being said about the region, and
              a phone shows the two together anyway. Given the width of the panel
              column it is pinned, on a wide screen, to the right half regardless,
              beneath the news and above the trends: everything the country itself
              has to say, in one column (see .card-grid in styles.css). At the
              square it starts as it is too narrow to be pinned to a half and
              stands in the block of tiles instead — where "nothing in force
              here", which is what it says almost every day, is one square rather
              than a row across the page. */}
          {shown("warnings") && <Warnings />}
          {/* Then the two readings of the wider place, each its own panel again
              and each its own line in the menu: what is being said around here,
              and what is on. Two questions, so two panels — read as one list, the
              rows answering either one were most of the answer to the other. */}
          {shown("nearby") && <NewsCard />}
          {shown("events") && <EventsCard />}
          {shown("trends") && <TrendsCard />}
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
