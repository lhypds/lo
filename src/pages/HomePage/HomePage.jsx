import { Fragment, Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Skeleton, showToast } from "../../ui/index.js";
import { cardSpan, useCards } from "../../utils/cards.js";
import { paginate } from "../../utils/pages.js";
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

// How far a finger has to travel before the page commits to turning, and how far
// before the drag is read as sideways at all rather than as a list being
// scrolled. The second is small because the answer is wanted early — the axis is
// decided once and the rest of the gesture belongs to it.
const TURN = 48;
const AXIS = 8;

export default function HomePage() {
  const { t } = useTranslation();
  // Posts come from the provider rather than from here: they are a reading of
  // the fix, like the place name is, and the refresh in the top bar has to be
  // able to reach them without knowing which page it is sitting on.
  const { coords, place, posts, addPost, supports, reloadToken } = useHere();
  // Which cards are on the page, and how much of the grid each of them covers.
  // Both halves of the first in one question — what this country can feed and
  // what the reader has kept — so the grid below asks once per card rather than
  // twice (see utils/cards.js). The plus in the top bar is the other end of it.
  const { shown, size, inAdditionOrder } = useCards(supports);
  // Held here, not in the map: expanding it hides the rest of the dashboard.
  const [mapExpanded, setMapExpanded] = useState(false);
  const [marks, setMarks] = useState([]);
  // Which page of the dashboard is under the reader's thumb, and the shape of
  // the module the pages are cut on — how many columns the grid has and how many
  // rows of it the window holds. Null until it has been measured, and the page
  // draws no cards until it has: a first pass on a guessed shape would mount
  // every card once, then move the ones that did not fit onto a second page and
  // mount them again, which for the cards that ask the server something is that
  // question asked twice.
  const [page, setPage] = useState(0);
  const [grid, setGrid] = useState(null);
  // The window the pages are seen through, the row of them behind it, the first
  // page — which is the one the module is measured off — and the gesture in
  // progress, if a finger is down.
  const viewRef = useRef(null);
  const trackRef = useRef(null);
  const firstRef = useRef(null);
  const swipeRef = useRef(null);
  const draggedRef = useRef(false);
  const frozenRef = useRef(false);
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

  // A fix that has crossed into a country with no map must not leave the page
  // expanded onto one, and neither must a reader who has just taken the map off
  // the page — the expanded layout empties out everything else.
  const expanded = mapExpanded && shown("map");

  // The observer below fires while the reader is still holding the map open —
  // hiding the strip and the dots hands the window a taller carousel — and
  // repaging on that reading would deal the cards onto different pages, which
  // for the map means being torn down and built again under the finger that
  // expanded it. So the pages are frozen at the shape they had while the map has
  // the window, and measured again when it gives it back.
  useLayoutEffect(() => {
    frozenRef.current = expanded;
  }, [expanded]);

  // Nothing to measure before there is a dashboard: until a fix lands the page
  // below is the gate, and the carousel is not on it.
  const located = Boolean(coords);
  useLayoutEffect(() => {
    const view = viewRef.current;
    const first = firstRef.current;
    if (!located || !view || !first) return;

    // The same arithmetic the stylesheet does, read back off the grid rather
    // than repeated from it: the column count is published as --cols and the gap
    // between the tiles is the grid's own, so a square is what is left of the
    // width once the gaps are out of it, and the rows are how many of those
    // stack up inside the window with the gaps between them.
    function measure() {
      if (frozenRef.current) return;
      const style = getComputedStyle(first);
      const cols = Math.max(1, parseInt(style.getPropertyValue("--cols"), 10) || 2);
      const gap = parseFloat(style.rowGap) || 0;
      const width =
        first.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = view.clientHeight;
      if (width <= 0 || height <= 0) return;
      const tile = (width - (cols - 1) * gap) / cols;
      // A dashboard page never grows past three rows, even when a tall desktop
      // window could hold more. Extra cards belong on the next page rather than
      // below the fold; on shorter windows we still use only the rows that fit.
      const rows = Math.max(1, Math.min(3, Math.floor((height + gap) / (tile + gap))));
      setGrid((current) =>
        current && current.cols === cols && current.rows === rows ? current : { cols, rows },
      );
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    return () => observer.disconnect();
  }, [located]);

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

  // Which of these the country can feed is the server's answer, and a card it
  // cannot feed is left out rather than left empty: an empty Trends card would
  // read as "nobody here is searching for anything". Which of the rest are worth
  // the room is the reader's, through the plus in the top bar — `shown` is both
  // answers at once. Only the mark button is unconditional: it is lo's own,
  // standing somewhere is not a thing any country can fail to support, and a
  // dashboard you can take every tile off should still let you keep where you
  // are.
  //
  // Written as a list rather than straight into the grid because the page is no
  // longer one grid: what each card covers has to be counted before any of them
  // is drawn, to know where the window fills up (see utils/pages.js). The order
  // is the page's own and paging does not touch it — the cards are cut into
  // pages exactly where they are written.
  const sized = (id, node) => ({ id, node, ...cardSpan(size(id)) });
  const defaultTiles = [
    shown("clock") && sized("clock", <ClockCard />),
    shown("weather") && sized("weather", <WeatherCard />),
    shown("map") &&
      sized(
        "map",
        <Suspense
          fallback={
            // The map's own card, drawn by the page while mapbox-gl is still on
            // the wire: the tile that lands here is a titled square, so the
            // thing holding its place has to be one too or the grid rearranges
            // itself around the heaviest thing it is waiting for.
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
        </Suspense>,
      ),
    // Last of the four squares, which on a two-column grid is the one to the
    // right of the map: the ground you are standing on first and the one thing
    // you can do about it after it — the button is the corner the block ends on.
    // A square by its own stylesheet rather than by the reader's choice, which is
    // why this one names its own ground.
    {
      id: "mark",
      cols: 1,
      rows: 1,
      node: (
        <MarkButton
          onLongPress={compose}
          onMarked={(mark) => setMarks((current) => [mark, ...current])}
          onUnmarked={(mark) => setMarks((current) => current.filter((item) => item.id !== mark.id))}
          onRenamed={(mark) =>
            setMarks((current) => current.map((item) => (item.id === mark.id ? mark : item)))
          }
        />
      ),
    },
    // The last two defaults complete the six-square opening page on mobile:
    // time, weather, map, mark, people and warnings, in that order. Optional
    // cards are appended below rather than being allowed to insert themselves
    // into this block.
    shown("people") && sized("people", <PeopleCard />),
    shown("warnings") && sized("warnings", <Warnings />),
  ].filter(Boolean);

  // Every card the reader explicitly adds follows the defaults, ordered by the
  // moment it was enabled. Pagination keeps that sequence intact, so each new
  // card takes the next available grid position or starts the next page.
  const addedTiles = inAdditionOrder(
    [
      shown("posts") && sized("posts", <PostsCard />),
      shown("nearby") && sized("nearby", <NewsCard />),
      shown("events") && sized("events", <EventsCard />),
      shown("trends") && sized("trends", <TrendsCard />),
    ].filter(Boolean),
  );
  const tiles = [...defaultTiles, ...addedTiles];

  // One page until the window has been measured, carrying nothing — that empty
  // grid is what it is measured against.
  const pages = grid ? paginate(tiles, grid.cols, grid.rows) : [[]];
  // A dashboard cut down to fewer pages than the reader had turned to — a card
  // put away, a panel shrunk, a window made taller — lands on the last one there
  // is rather than on a page that is no longer there.
  const current = Math.min(page, pages.length - 1);

  function turnTo(index) {
    setPage(Math.max(0, Math.min(index, pages.length - 1)));
  }

  // The page follows the drag while it is under way and settles when it is let
  // go, rather than waiting for the gesture to be over to move at all: a page
  // that only ever arrives already turned gives the reader nothing to aim with.
  //
  // A finger and a pointer are the same gesture here, so both are read the same
  // way and the four below take a bare position rather than an event. Turning the
  // page is the dashboard's own movement — the dots say the pages are side by
  // side, and a thing said to be side by side should be draggable sideways
  // whether the reader is holding the phone or the mouse.
  //
  // Not from the map, where a drag is the reader panning it, and not while the
  // map has the window — the whole of the dashboard is one card then, and there
  // is nowhere to turn to.
  function beginSwipe(x, y, target) {
    draggedRef.current = false;
    if (expanded) return;
    if (target?.closest?.(".mapboxgl-map")) return;
    swipeRef.current = { x, y, axis: null };
  }

  // The axis is decided once, on the first few pixels, and the rest of the
  // gesture belongs to whichever it was: sideways turns the page, and down is a
  // list inside a panel being scrolled, which is the browser's to do. Nothing
  // has to be taken off the browser for a finger — the page already asks for
  // pan-y and nothing else (see the note on body in styles.css), so a sideways
  // drag was never going to be answered by anything but this.
  //
  // A pointer is the one that needs saying: a drag across a page of type is a
  // selection being made unless the page says otherwise, and it only says so once
  // the drag has turned out to be sideways — up to that moment the reader may
  // well be selecting a line of a post. Whatever was caught in the first few
  // pixels is let go of at the same moment.
  function moveSwipe(x, y) {
    const start = swipeRef.current;
    const track = trackRef.current;
    if (!start || !track) return;
    const deltaX = x - start.x;
    const deltaY = y - start.y;
    if (!start.axis) {
      if (Math.abs(deltaX) < AXIS && Math.abs(deltaY) < AXIS) return;
      start.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      if (start.axis === "x") {
        viewRef.current?.classList.add("dragging");
        window.getSelection()?.removeAllRanges();
      }
    }
    if (start.axis !== "x") return;
    // Past either end the page still gives, at a third of the distance: enough
    // to say the drag was felt and that there is nothing on that side, without
    // a hard stop under the hand.
    const atEdge = (current === 0 && deltaX > 0) || (current === pages.length - 1 && deltaX < 0);
    const offset = atEdge ? deltaX / 3 : deltaX;
    track.style.transition = "none";
    track.style.transform = `translateX(calc(${-current * 100}% + ${offset}px))`;
  }

  function endSwipe(x, y) {
    const start = swipeRef.current;
    swipeRef.current = null;
    const track = trackRef.current;
    viewRef.current?.classList.remove("dragging");
    if (!start || !track) return;
    const deltaX = x - start.x;
    let next = current;
    if (start.axis === "x" && Math.abs(deltaX) >= TURN) {
      next = deltaX < 0 ? Math.min(current + 1, pages.length - 1) : Math.max(current - 1, 0);
    }
    // A drag that ends on a link or a button is a drag, not a press: the click
    // the pointer is about to raise on whatever it came to rest over is swallowed
    // (see below). Only a real sideways drag counts — a still hand that wandered
    // a pixel is still pressing the thing under it.
    draggedRef.current = start.axis === "x" && Math.abs(deltaX) > AXIS;
    track.style.transition = "";
    track.style.transform = `translateX(${-next * 100}%)`;
    if (next !== current) setPage(next);
  }

  function cancelSwipe() {
    const track = trackRef.current;
    viewRef.current?.classList.remove("dragging");
    if (!swipeRef.current || !track) return;
    swipeRef.current = null;
    track.style.transition = "";
    track.style.transform = `translateX(${-current * 100}%)`;
  }

  // The click that follows the drag, caught on the way down before it reaches the
  // card it landed on. A touch that turns into a page turn raises no click on most
  // browsers anyway; a mouse always does, and letting it through would open
  // whichever post happened to be under the cursor when the page arrived.
  function swallowClick(event) {
    if (!draggedRef.current) return;
    draggedRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

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
        {/* The dashboard is dealt out over as many pages as it takes rather than
            scrolled: a page of it is a window's worth of tiles, turned with a
            thumb, and what is on the screen is always a whole number of cards.
            The row of them is one strip translated sideways, so a page that has
            been turned away from keeps everything it had — the map its bearing,
            a list where it was scrolled to. */}
        <div
          ref={viewRef}
          className="card-carousel"
          // Both hands on the same four. A pointer that is not a finger is the
          // mouse and the trackpad — a touch raises pointer events of its own on
          // top of the touch ones, and reading a drag twice would turn two pages.
          onPointerDown={(event) => {
            if (event.pointerType !== "touch") beginSwipe(event.clientX, event.clientY, event.target);
          }}
          onPointerMove={(event) => {
            if (event.pointerType !== "touch" && event.buttons === 1) {
              moveSwipe(event.clientX, event.clientY);
            }
          }}
          onPointerUp={(event) => {
            if (event.pointerType !== "touch") endSwipe(event.clientX, event.clientY);
          }}
          // A button let go of outside the carousel never raises its up here, so
          // leaving is where a pointer drag ends if it ends anywhere else.
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") cancelSwipe();
          }}
          // Guarded like the rest of them, and this one is the whole gesture on a
          // phone: a browser raises pointercancel on a touch pointer the moment
          // it decides what the gesture is for — which is a few pixels into every
          // drag, long before the finger is anywhere near lifting. Left to answer
          // that, the carousel put every swipe back before it had begun. What a
          // finger being taken away really looks like is touchcancel, below.
          onPointerCancel={(event) => {
            if (event.pointerType !== "touch") cancelSwipe();
          }}
          // A name in a list is a link and a post's photo is an image, and the
          // browser will take a drag on either of them off this page and turn it
          // into a drag-and-drop — which raises a pointercancel and strands the
          // strip halfway through a turn. Over the dashboard a sideways drag is
          // only ever the page being turned.
          onDragStart={(event) => event.preventDefault()}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (touch) beginSwipe(touch.clientX, touch.clientY, event.target);
          }}
          onTouchMove={(event) => {
            const touch = event.touches[0];
            if (touch) moveSwipe(touch.clientX, touch.clientY);
          }}
          onTouchEnd={(event) => {
            const touch = event.changedTouches[0];
            if (touch) endSwipe(touch.clientX, touch.clientY);
          }}
          onTouchCancel={cancelSwipe}
          onClickCapture={swallowClick}
        >
          <div
            ref={trackRef}
            className="card-track"
            style={{ transform: expanded ? undefined : `translateX(${-current * 100}%)` }}
          >
            {pages.map((cards, index) => (
              <div
                key={index}
                ref={index === 0 ? firstRef : null}
                className="card-grid"
                // A page held off screen is held out of reach as well: its links
                // are not somewhere the tab key should be able to walk to, and a
                // reader listening rather than looking is turning pages with the
                // dots below like everyone else.
                inert={index !== current && !expanded}
              >
                {cards.map((card) => (
                  <Fragment key={card.id}>{card.node}</Fragment>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* How many pages there are and which one this is, in the plainest mark
            the page has: one dot each. Each is also the way to that page for a
            reader who would rather aim at it than drag their way across to it —
            a dot is a button. */}
        <div className="card-pager">
          <div className="pager-dots">
            {pages.map((_, index) => (
              <button
                key={index}
                type="button"
                className={`pager-dot${index === current ? " active" : ""}`}
                aria-label={t("location.page", { number: index + 1, total: pages.length })}
                aria-current={index === current ? "true" : undefined}
                onClick={() => turnTo(index)}
              />
            ))}
          </div>
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
