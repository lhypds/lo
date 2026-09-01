import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Card, Lightbox, Modal, Skeleton, TileId, showToast } from "../../ui/index.js";
import { arrangeCards, cardLabel, cardSpan, useCards } from "../../utils/cards.js";
import { formatCoords } from "../../utils/format.js";
import { postPhoto } from "../../utils/image.js";
import { labelName } from "../../utils/label.js";
import { keepPage, openPage, paginate } from "../../utils/pages.js";
import { updateVenueComments, useVenues } from "../../utils/venues.js";
import { updateHistoryComments, useHistoryPlaces } from "../../utils/historyPlaces.js";
import { updateWikiComments, useWikiPlaces, wikiPhoto } from "../../utils/wikiPlaces.js";
import { getLocationState, refreshLocation } from "../../utils/location.js";
import CafeCard from "../../cards/CafeCard/index.js";
import CardSize from "../../components/CardSize/index.js";
import ClockCard from "../../cards/ClockCard/index.js";
import CommentsModal from "../../components/CommentsModal/index.js";
import ComposeModal from "../../components/ComposeModal/index.js";
import DirectionCard from "../../cards/DirectionCard/index.js";
import EventsCard from "../../cards/EventsCard/index.js";
import FoodCard from "../../cards/FoodCard/index.js";
import Header from "../../components/Header/index.js";
import HereStrip from "../../components/HereStrip/index.js";
import LocationGate from "../../components/LocationGate/index.js";
import MarkButton from "../../cards/MarkButton/index.js";
import NewsCard from "../../cards/NewsCard/index.js";
import PeopleCard from "../../cards/PeopleCard/index.js";
import PostsCard from "../../cards/PostsCard/index.js";
import RadioCard from "../../cards/RadioCard/index.js";
import ThenCard from "../../cards/ThenCard/index.js";
import TrendsCard from "../../cards/TrendsCard/index.js";
import Warnings from "../../cards/Warnings/index.js";
import WeatherCard from "../../cards/WeatherCard/index.js";
import WikipediaCard from "../../cards/WikipediaCard/index.js";
import { useHere } from "../../components/LocationProvider/index.js";

// mapbox-gl is by far the heaviest thing lo loads, and the login and gate
// screens both come before any map — so it is fetched only once there is a
// position worth drawing.
const MapCard = lazy(() => import("../../cards/MapCard/MapCard.jsx"));

// How far a finger has to travel before the page commits to turning, and how far
// before the drag is read as sideways at all rather than as a list being
// scrolled. The second is small because the answer is wanted early — the axis is
// decided once and the rest of the gesture belongs to it.
const TURN = 48;
const AXIS = 8;

// A press on a card's heading that stays put for this long is the reader picking
// the card up rather than turning the page, and one that wanders further than
// SLOP before then was a page turn from the start. The length is the mark
// button's, because a hold should mean one thing at one length across the app.
const HOLD = 500;
const SLOP = 10;

// How near the edge of the strip a carried card has to be held for the page under
// it to turn, and how long it has to be held there. Both are the reader saying
// they mean it: the zone is narrower than the gutter the tiles keep, so a card
// being placed in the outside column is not also a card being taken to the next
// page, and half a second of holding still is longer than any drag spends
// crossing the edge on its way somewhere else.
const EDGE = 24;
const EDGE_MS = 600;

// Which card a point is over, by name. The tiles say which card they are (see
// TileId in ui/Card) rather than being counted off against the list they were
// dealt from: a card can decline to draw anything at all — the warnings tile does,
// where there is nobody to ask — and a page of the grid holding one fewer element
// than the page holds cards would put every id after it out by one.
//
// Null over the seams between the tiles, which is nowhere in particular: a card
// carried across a gap should stay where it is rather than jump to whichever side
// of it the arithmetic rounded to.
function cardAt(grid, x, y) {
  const tiles = grid ? [...grid.children] : [];
  for (const tile of tiles) {
    const box = tile.getBoundingClientRect();
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
      return tile.dataset.card ?? null;
    }
  }
  // Below the last row is the end of the page rather than nowhere: a short last
  // row leaves the rest of the grid empty, and that space is somewhere the reader
  // can plainly mean to put a card down.
  const last = tiles[tiles.length - 1];
  return last && y > last.getBoundingClientRect().bottom ? (last.dataset.card ?? null) : null;
}

// Where an id stands in a line of them, and behind everything in it when it is
// not in the line at all — a card the dashboard picked up while another one was
// in the air has no place in an order settled before it arrived.
function placeIn(ids, id) {
  const at = ids.indexOf(id);
  return at === -1 ? Number.MAX_SAFE_INTEGER : at;
}

// The same list with one id moved to a place in it. `to` is where the id ends up
// rather than where it is put in — the two differ by one when a card is moving
// forwards, since lifting it out of the line shortens everything after it. The
// list itself comes back when nothing moved, which is how the drag below tells a
// gesture that changed the page from one that did not.
function moveTo(ids, id, to) {
  const from = ids.indexOf(id);
  if (from === -1 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export default function HomePage() {
  const { t, i18n } = useTranslation();
  // Posts come from the provider rather than from here: they are a reading of
  // the fix, like the place name is, and the refresh in the top bar has to be
  // able to reach them without knowing which page it is sitting on.
  //
  // Read rather than asked for — useHere and not useNearbyPosts. The page draws
  // no posts of its own; what it does is hand whatever list is standing to the
  // map, and the thing that makes there be one is the posts panel below, if the
  // reader has put it on the dashboard. So an untouched dashboard is a map of
  // marks, and nothing is fetched on behalf of a reader who has not asked to see
  // what is around them (see LocationProvider).
  const { coords, place, posts, addPost, replacePost, supports, reloadToken } = useHere();
  // Which cards are on the page, and how much of the grid each of them covers.
  // Both halves of the first in one question — what this country can feed and
  // what the reader has kept — so the grid below asks once per card rather than
  // twice (see utils/cards.js). The plus in the top bar is the other end of it.
  const { shown, size, inAdditionOrder, arrange } = useCards(supports);
  // Whatever the food and café cards have found, on its way to the map — the one
  // list on this page that is not the page's own. It is read here rather than in
  // the map because which lists a map is drawing is the page's answer to give
  // (see the props on MapCard), and it is empty whenever neither card is on the
  // dashboard, which is what makes the pins the reader's choice too.
  const venues = useVenues();
  // What the Wikipedia card has found, on its way to the map for the same
  // reason the venues are (see useVenues above).
  const wikiPlaces = useWikiPlaces();
  // And what the history card has, which rides the map's landmark layer beside
  // it: the two lists arrive in one shape and differ in the `kind` their rows
  // wear, which is what picks the drawing in the pin's head (see MapCard).
  // Joined under useMemo so a render in which neither store spoke hands the
  // map the same array and its markers stand rather than rebuild.
  const historyPlaces = useHistoryPlaces();
  const storiedPlaces = useMemo(
    () => (historyPlaces.length > 0 ? [...wikiPlaces, ...historyPlaces] : wikiPlaces),
    [wikiPlaces, historyPlaces],
  );
  // Held here, not in the map: expanding it hides the rest of the dashboard.
  const [mapExpanded, setMapExpanded] = useState(false);
  const [marks, setMarks] = useState([]);
  // The two sheets a saved mark's map preview can ask for. They live at page
  // level because the map is a container-sized tile, while either sheet belongs
  // to the window; the same arrangement is used on the marks page.
  const [editingMark, setEditingMark] = useState(null);
  const [deletingMark, setDeletingMark] = useState(null);
  const [deletingMarkBusy, setDeletingMarkBusy] = useState(false);
  const [deletingMarkError, setDeletingMarkError] = useState("");
  // Which page of the dashboard is under the reader's thumb, and the shape of
  // the module the pages are cut on — how many columns the grid has and how many
  // rows of it the window holds. Null until it has been measured, and the page
  // draws no cards until it has: a first pass on a guessed shape would mount
  // every card once, then move the ones that did not fit onto a second page and
  // mount them again, which for the cards that ask the server something is that
  // question asked twice.
  //
  // Opened on the page the reader left, read off this browser's shelf as the
  // state is made rather than watched: where the strip stands is this page's own
  // business from here on, and the number kept in storage is only how it is
  // handed back after a reload (see openPage in utils/pages.js).
  const [page, setPage] = useState(openPage);
  const [grid, setGrid] = useState(null);
  // Whether the strip has been turned yet, which is the whole of what decides
  // whether it slides. A dashboard opened at page three — where the reader was
  // standing when they left it, kept in this browser on the way out — is
  // measured before it is drawn, so the first transform the track is given is
  // already the one that puts page three under the window. Left to the
  // stylesheet that is a swipe across two pages on arrival, and a page seen to
  // turn is a page being turned: this one was turned a while ago, by a reader
  // who has since been somewhere else and come back to where they left off.
  //
  // Set by the two gestures that are a turn — a finger dragged across the strip,
  // a dot pressed — and never unset: from the first of them on, wherever the
  // strip stands is somewhere the reader moved it to, and moving is worth
  // showing. Everything else that changes which page is under the window is the
  // dashboard being re-dealt rather than turned — a card added, a panel grown, a
  // window resized — and lands the same way this does.
  const [turned, setTurned] = useState(false);
  // The window the pages are seen through, the row of them behind it, the first
  // page — which is the one the module is measured off — and the gesture in
  // progress, if a finger is down.
  const viewRef = useRef(null);
  const trackRef = useRef(null);
  const firstRef = useRef(null);
  const swipeRef = useRef(null);
  const draggedRef = useRef(false);
  const frozenRef = useRef(false);
  // The card the reader has picked up by its heading, if any: which one it is,
  // the order the dashboard stands in while it is up, and the order it stood in
  // when it was lifted. Nothing is written down until it is set back down, so the
  // rearranging under the finger is a preview and the last of the three is what
  // says whether the gesture came to anything.
  const [carry, setCarry] = useState(null);
  // The press that has not become a carry yet, and the last place the finger was
  // seen — the chip is put there as it mounts, one render after the fact.
  const holdRef = useRef(null);
  const chipRef = useRef(null);
  const pointRef = useRef({ x: 0, y: 0 });
  // A carried card held against one edge of the strip, waiting on the page there
  // to turn.
  const edgeRef = useRef(null);
  // The fix the hold was made on, which is also what says the sheet is open —
  // what is written belongs to the spot its writer was standing on when they
  // started it, not to wherever they have drifted by the time they press the
  // button at the foot of the sheet.
  const [composing, setComposing] = useState(null);
  // The post whose remarks are open over the page, from the count in the corner
  // of its bubble on the map. Held here rather than in the card: a tile is a
  // container-sized box, which would be the containing block of any fixed sheet
  // mounted inside it.
  const [commenting, setCommenting] = useState(null);
  // The same sheet opened from a food or café pin. Separate from the post in
  // hand because the two use different API identities: lo numbers a post, while
  // OpenStreetMap names a venue with a type/id pair.
  const [venueCommenting, setVenueCommenting] = useState(null);
  // And the post whose photograph is being looked at, from the picture in the
  // same bubble — held out here for the same reason, and doubly so while the map
  // is expanded and is the whole of the page.
  const [viewing, setViewing] = useState(null);
  // The same sheet again, opened from a Wikipedia row or pin — its own state
  // because a landmark's comment thread is a different subject from a café's,
  // even though both are answered by the same CommentsModal underneath (see
  // the two instances of it near the foot of this file).
  const [wikiCommenting, setWikiCommenting] = useState(null);

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
      const width = first.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = view.clientHeight;
      if (width <= 0 || height <= 0) return;
      const tile = (width - (cols - 1) * gap) / cols;
      // Use every complete row the window can show. A short window still keeps
      // one row so an unusually tall card has a page to stand on.
      const rows = Math.max(1, Math.floor((height + gap) / (tile + gap)));
      setGrid((current) => (current && current.cols === cols && current.rows === rows ? current : { cols, rows }));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    return () => observer.disconnect();
  }, [located]);

  // Nothing outlives the page: a hold still counting when the reader leaves is
  // not a card being picked up on the way out, and neither is a page waiting to
  // turn under one.
  useEffect(
    () => () => {
      window.clearTimeout(holdRef.current?.timer);
      window.clearTimeout(edgeRef.current?.timer);
    },
    [],
  );

  // The tile in hand, marked as such for as long as it is. Written onto the
  // element rather than passed into the card, for the reason the strip's own drag
  // is a class and not state: what is on the grid is whatever the dashboard is
  // carrying, none of those cards knows it is being moved, and a card moving
  // across the grid should not also be a page re-rendering to say so. Every
  // render, because the mark goes with the card and the card is changing places.
  useLayoutEffect(() => {
    if (!carry) return undefined;
    const tile = trackRef.current?.querySelector(`[data-card="${carry.id}"]`);
    tile?.classList.add("carried");
    // The chip arrives with the card, a render after the finger last said where
    // it was, so it is put in place as it mounts rather than at the next move.
    placeChip();
    return () => tile?.classList.remove("carried");
  });

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

  // What the hold's sheet made, which is a post or a spot depending on which way
  // its switch was thrown. Either way it goes straight onto the map rather than
  // through a refetch: the writer is looking at the ground they just wrote about.
  function created(written, kind) {
    setComposing(null);
    if (kind === "post") {
      addPost(written);
      showToast(t("post.posted"), 1800);
      return;
    }
    setMarks((current) => [written, ...current]);
    showToast(t("mark.saved"), 1800);
  }

  function markEdited(mark) {
    setMarks((current) => current.map((item) => (item.id === mark.id ? mark : item)));
    setEditingMark(null);
  }

  function askToDeleteMark(mark) {
    setDeletingMarkError("");
    setDeletingMark(mark);
  }

  function closeDeleteMark() {
    if (deletingMarkBusy) return;
    setDeletingMark(null);
    setDeletingMarkError("");
  }

  async function confirmDeleteMark() {
    if (!deletingMark || deletingMarkBusy) return;
    setDeletingMarkBusy(true);
    setDeletingMarkError("");
    try {
      await api.deleteMark(deletingMark.id);
      setMarks((current) => current.filter((item) => item.id !== deletingMark.id));
      setDeletingMark(null);
    } catch (error) {
      setDeletingMarkError(error.message);
    } finally {
      setDeletingMarkBusy(false);
    }
  }

  const deletingMarkName = deletingMark
    ? labelName(deletingMark, i18n.language) || formatCoords(deletingMark.latitude, deletingMark.longitude)
    : "";

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
            // itself around the heaviest thing it is waiting for. The minus is
            // part of being one: mapbox-gl is the heaviest thing lo fetches, and
            // a reader who does not want the map is exactly the one who should
            // not have to wait for it to arrive before saying so.
            <Card title={t("map.title")} action={<CardSize id="map" />} square flush>
              <Skeleton fill label={t("common.loading")} />
            </Card>
          }
        >
          {/* Everything that is here: the spots you kept and you standing among
              them, and — where the reader has added the panel that asks for
              them — the posts whoever came past left, and where lunch is where
              they have added those cards. Three lists on the same square, each
              of them on it exactly when its card is on the page. The marks page
              answers a different question — where have I been, in order — which
              is why that one carries a list and this one does not. */}
          <MapCard
            posts={posts}
            marks={marks}
            venues={venues}
            wikiPlaces={storiedPlaces}
            expanded={expanded}
            onToggleExpanded={() => setMapExpanded((value) => !value)}
            onOpenComments={setCommenting}
            onOpenVenueComments={setVenueCommenting}
            onOpenWikiComments={setWikiCommenting}
            onOpenPhoto={setViewing}
            onEditMark={setEditingMark}
            onDeleteMark={askToDeleteMark}
          />
        </Suspense>,
      ),
    // Last of the four squares, which on a two-column grid is the one to the
    // right of the map: the ground you are standing on first and the one thing
    // you can do about it after it — the button is the corner the block ends on.
    // Sized like the rest of them even though it is the one card the reader
    // cannot put away: it is a square by the catalog's answer rather than by its
    // own stylesheet, which is what lets it be dragged about with the others.
    sized(
      "mark",
      <MarkButton
        onLongPress={compose}
        onMarked={(mark) => setMarks((current) => [mark, ...current])}
        onUnmarked={(mark) => setMarks((current) => current.filter((item) => item.id !== mark.id))}
        onUpdated={(mark) => setMarks((current) => current.map((item) => (item.id === mark.id ? mark : item)))}
      />,
    ),
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
      shown("radio") && sized("radio", <RadioCard />),
      // The same sheet the pins on the map open, because it is the same
      // conversation about the same place: a card and a bubble are two views of
      // one list, and what is added from either goes back into the venue store
      // and is on both (see the second CommentsModal at the foot of the page).
      shown("food") && sized("food", <FoodCard onOpenComments={setVenueCommenting} />),
      shown("cafe") && sized("cafe", <CafeCard onOpenComments={setVenueCommenting} />),
      // The same remarks sheet the pins on the map open, because it is the
      // same landmark either way (see the third CommentsModal at the foot of
      // the page).
      shown("wikipedia") &&
        sized(
          "wikipedia",
          <WikipediaCard onOpenComments={setWikiCommenting} onOpenPhoto={setViewing} />,
        ),
      // The same remarks sheet and the same Lightbox as the landmarks above,
      // because an old photograph of the street is the same two kinds of thing:
      // somewhere to leave a word, and a picture to look at properly.
      shown("history") &&
        sized("history", <ThenCard onOpenComments={setWikiCommenting} onOpenPhoto={setViewing} />),
      shown("direction") && sized("direction", <DirectionCard />),
    ].filter(Boolean),
  );
  // The page's own order first, then the reader's over the top of it: a card that
  // has been dragged somewhere stays where it was put, and one that never has
  // keeps the place the list above gives it (see utils/cards.js).
  const tiles = arrange([...defaultTiles, ...addedTiles]);
  // While a card is up the dashboard stands in the order the drag has reached so
  // far, which is a preview and not a decision — the grid rearranges itself under
  // the finger and nothing is written until the card is set down.
  const laid = carry ? [...tiles].sort((a, b) => placeIn(carry.ids, a.id) - placeIn(carry.ids, b.id)) : tiles;

  // One page until the window has been measured, carrying nothing — that empty
  // grid is what it is measured against.
  const pages = grid ? paginate(laid, grid.cols, grid.rows) : [[]];
  // A dashboard cut down to fewer pages than the reader had turned to — a card
  // put away, a panel shrunk, a window made taller — lands on the last one there
  // is rather than on a page that is no longer there.
  const current = Math.min(page, pages.length - 1);

  function turnTo(index) {
    const next = Math.max(0, Math.min(index, pages.length - 1));
    setTurned(true);
    setPage(next);
    // And onto the shelf, so that a reader who opens a post and comes back — or
    // closes the tab and opens lo again tomorrow — arrives on the page they were
    // standing on rather than at the front. Nothing goes into the route: a run of
    // swipes is not a run of places to go back through, and the number would not
    // survive being sent to anyone anyway (see keepPage in utils/pages.js).
    keepPage(next);
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
    // At the start of the gesture rather than at the end of it: the strip has to
    // be a thing that slides again by the time the finger is lifted, since what
    // settles the page it is let go on is the same transition (see endSwipe).
    setTurned(true);
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
    if (next !== current) turnTo(next);
  }

  function cancelSwipe() {
    const track = trackRef.current;
    viewRef.current?.classList.remove("dragging");
    if (!swipeRef.current || !track) return;
    swipeRef.current = null;
    track.style.transition = "";
    track.style.transform = `translateX(${-current * 100}%)`;
  }

  // Picking a card up is the other thing a press on the dashboard can be, and it
  // is read alongside the page turn rather than instead of it: up to the moment
  // the hold fires the same press is still a swipe, and a press that moves is one.
  //
  // The handle is the card's own heading — the one strip of a tile that is
  // neither something to read nor something to press, and the plainest thing to
  // call a card by. The buttons standing in it keep their own press: a hold on
  // the plus that makes a panel taller is that button, held.
  function beginHold(x, y, target, pointerId) {
    if (expanded) return;
    const head = target?.closest?.("header");
    if (!head || target.closest("button")) return;
    const id = head.closest("[data-card]")?.dataset.card;
    if (!id || !trackRef.current?.children[current]?.contains(head)) return;
    pointRef.current = { x, y };
    holdRef.current = { x, y, timer: window.setTimeout(() => lift(id, pointerId), HOLD) };
  }

  function cancelHold() {
    window.clearTimeout(holdRef.current?.timer);
    holdRef.current = null;
  }

  function moveHold(x, y) {
    const hold = holdRef.current;
    if (!hold) return;
    if (Math.abs(x - hold.x) > SLOP || Math.abs(y - hold.y) > SLOP) cancelHold();
  }

  // The card is in the air. Whatever the first few pixels of this press did to the
  // strip is put back — it was not a page turn after all — and the buzz is the
  // only signal a hold has landed on a phone, where the finger is covering the
  // card it has just picked up.
  function lift(id, pointerId) {
    holdRef.current = null;
    cancelSwipe();
    if (navigator.vibrate) navigator.vibrate(30);
    window.getSelection()?.removeAllRanges();
    viewRef.current?.classList.add("carrying");
    // A mouse carrying a card off the strip — down over the dots, up over the
    // place name — is still carrying it, so the strip keeps hold of the pointer
    // until it is let go of. A finger is already held by where it landed.
    try {
      if (pointerId != null) viewRef.current?.setPointerCapture(pointerId);
    } catch {
      // The pointer is gone: the press ended somewhere inside the hold
    }
    const ids = laid.map((tile) => tile.id);
    setCarry({ id, ids, was: ids });
  }

  // Where the card would land if it were let go here: the tile under the finger
  // gives up its place, and everything between there and where the card came from
  // shuffles along to fill the hole it leaves. Only the tiles on this page are on
  // offer — a card put down somewhere the reader cannot see it is a card they have
  // lost — and the pages are one list cut up in order, so taking a tile's place on
  // the page is taking its place in the list.
  function moveCarry(x, y) {
    if (!carry) return;
    pointRef.current = { x, y };
    placeChip();
    waitAtEdge(x);
    const over = cardAt(trackRef.current?.children[current], x, y);
    if (over == null) return;
    const ids = moveTo(carry.ids, carry.id, carry.ids.indexOf(over));
    if (ids !== carry.ids) setCarry({ ...carry, ids });
  }

  // A card held against either edge of the strip turns the page under it, and
  // comes along to the new one — a hand that has just been carried to page two is
  // not still holding something on page one. Without this the dashboard could only
  // be rearranged a page at a time, and what is on the second page could never be
  // brought to the front: there is nowhere on the first page to pick it up from.
  //
  // The wait is armed once and cleared when it fires, so a card held perfectly
  // still turns one page and a card still being moved along the edge keeps
  // turning them.
  function waitAtEdge(x) {
    const box = viewRef.current?.getBoundingClientRect();
    if (!box) return;
    const dir = x < box.left + EDGE ? -1 : x > box.right - EDGE ? 1 : 0;
    const waiting = edgeRef.current;
    if (waiting?.dir === dir) return;
    window.clearTimeout(waiting?.timer);
    edgeRef.current = null;
    const next = current + dir;
    if (dir === 0 || next < 0 || next > pages.length - 1) return;
    edgeRef.current = {
      dir,
      timer: window.setTimeout(() => {
        edgeRef.current = null;
        turnTo(next);
        // Onto the near end of the page being turned to — the front of it going
        // forwards and the back of it coming back, which is the edge the card was
        // carried across either way. Named by the card already standing there,
        // whose place it takes.
        const arrival = dir > 0 ? pages[next][0] : pages[next][pages[next].length - 1];
        setCarry((held) => (held ? { ...held, ids: moveTo(held.ids, held.id, held.ids.indexOf(arrival?.id)) } : held));
      }, EDGE_MS),
    };
  }

  // Set down. The order under the finger is the order that is kept, and only if
  // the card actually went somewhere — a hold that was thought better of leaves
  // the dashboard exactly as it found it.
  function endCarry(keep) {
    const held = carry;
    setCarry(null);
    window.clearTimeout(edgeRef.current?.timer);
    edgeRef.current = null;
    viewRef.current?.classList.remove("carrying");
    if (!held) return;
    if (keep && held.ids !== held.was) arrangeCards(held.ids);
    // The press that set the card down ends in a click on whatever it came to
    // rest over, which is swallowed the way the end of a page turn is.
    draggedRef.current = true;
  }

  // The name of the card in hand, under the hand that has it. Moved by hand for
  // the reason the strip is: a card crossing the grid is not a page rendered once
  // per pixel on the way. Above the finger, which on a phone is covering the tile
  // it is answering about.
  function placeChip() {
    const { x, y } = pointRef.current;
    chipRef.current?.style.setProperty("transform", `translate(calc(${x}px - 50%), ${y - 44}px)`);
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
      <main className={expanded ? "home-main home-main-map" : "home-main"} aria-label={t("location.title")}>
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
            if (event.pointerType === "touch") return;
            // A card still in hand as a new press begins is one whose release was
            // never seen — a button let go of outside the window, where no up is
            // delivered. It is set down before anything else happens, so the
            // dashboard cannot be left carrying something nobody is holding.
            if (carry) endCarry(true);
            beginSwipe(event.clientX, event.clientY, event.target);
            // The left button only: a press held on the right of the mouse is a
            // menu being asked for, not a card being picked up.
            if (event.button === 0) {
              beginHold(event.clientX, event.clientY, event.target, event.pointerId);
            }
          }}
          onPointerMove={(event) => {
            if (event.pointerType === "touch" || event.buttons !== 1) return;
            if (carry) {
              moveCarry(event.clientX, event.clientY);
              return;
            }
            moveHold(event.clientX, event.clientY);
            moveSwipe(event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            if (event.pointerType === "touch") return;
            cancelHold();
            if (carry) endCarry(true);
            else endSwipe(event.clientX, event.clientY);
          }}
          // A button let go of outside the carousel never raises its up here, so
          // leaving is where a pointer drag ends if it ends anywhere else. A card
          // in hand is held by the pointer capture taken out when it was lifted,
          // so this is only reached with one after that capture has been lost —
          // and a card whose drag cannot be followed any further is set down
          // where the reader last saw it rather than put back.
          onPointerLeave={(event) => {
            if (event.pointerType === "touch") return;
            cancelHold();
            if (carry) endCarry(true);
            else cancelSwipe();
          }}
          // Guarded like the rest of them, and this one is the whole gesture on a
          // phone: a browser raises pointercancel on a touch pointer the moment
          // it decides what the gesture is for — which is a few pixels into every
          // drag, long before the finger is anywhere near lifting. Left to answer
          // that, the carousel put every swipe back before it had begun. What a
          // finger being taken away really looks like is touchcancel, below.
          onPointerCancel={(event) => {
            if (event.pointerType === "touch") return;
            cancelHold();
            if (carry) endCarry(false);
            else cancelSwipe();
          }}
          // Android raises its own menu on a hold, over the card the same hold is
          // picking up — and it raises it while the press is still being counted,
          // which would take the card back out of the reader's hand.
          onContextMenu={(event) => {
            if (holdRef.current || carry) event.preventDefault();
          }}
          // A name in a list is a link and a post's photo is an image, and the
          // browser will take a drag on either of them off this page and turn it
          // into a drag-and-drop — which raises a pointercancel and strands the
          // strip halfway through a turn. Over the dashboard a sideways drag is
          // only ever the page being turned.
          onDragStart={(event) => event.preventDefault()}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (!touch) return;
            beginSwipe(touch.clientX, touch.clientY, event.target);
            beginHold(touch.clientX, touch.clientY, event.target);
          }}
          onTouchMove={(event) => {
            const touch = event.touches[0];
            if (!touch) return;
            if (carry) {
              moveCarry(touch.clientX, touch.clientY);
              return;
            }
            moveHold(touch.clientX, touch.clientY);
            moveSwipe(touch.clientX, touch.clientY);
          }}
          onTouchEnd={(event) => {
            cancelHold();
            const touch = event.changedTouches[0];
            if (carry) endCarry(true);
            else if (touch) endSwipe(touch.clientX, touch.clientY);
          }}
          onTouchCancel={() => {
            cancelHold();
            if (carry) endCarry(false);
            else cancelSwipe();
          }}
          onClickCapture={swallowClick}
        >
          <div
            ref={trackRef}
            // Placed, until the reader turns it: the page the route asks for is
            // under the window from the first frame rather than swiped to (see
            // `turned` above, and .card-track.placing in styles.css).
            className={`card-track${turned ? "" : " placing"}`}
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
                {/* Each tile is told which card it is on the way in, and says so
                    on its own element: what a heading held for half a second has
                    picked up, and what the tile under the finger would give its
                    place to, are both read back off the grid (see TileId in
                    ui/Card). A provider draws nothing, so the tiles are still the
                    grid's own children and the module is untouched. */}
                {cards.map((card) => (
                  <TileId.Provider key={card.id} value={card.id}>
                    {card.node}
                  </TileId.Provider>
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

      {/* The card in hand, named, riding just above the finger that has it. The
          tile itself stays on the grid and shows where the card would land, so
          what is missing is which of them is the one being moved — a hand covers
          a square of a phone whole. Outside the strip, whose pages are one
          translated row: a fixed box inside a transformed one is laid out against
          it rather than against the window. */}
      {carry && (
        <div ref={chipRef} className="card-chip" aria-hidden="true">
          {t(cardLabel(carry.id))}
        </div>
      )}

      {/* Outside <main>, which is emptied down to the map while it is expanded:
          the hold that opens this can be made on the full-screen map too.
          Reading a post needs nothing out here — the bubble on its own square
          says the whole of it — and rewriting or taking one down is done from the
          list on the posts page, where every post of yours is in one place. */}
      <ComposeModal
        isOpen={Boolean(composing)}
        coords={composing}
        place={place ? [place.locality, place.name, place.region].filter(Boolean).join(" · ") : ""}
        onClose={() => setComposing(null)}
        onCreated={created}
      />

      {/* The map preview asks for these, but the page owns them: fixed sheets
          mounted inside the map tile would be sized against that tile instead
          of the window. Both mutations update the same list the pins use.

          The same sheet the hold opens, on a spot that already exists: a second
          thought about one is the same act as keeping it — the same name, the
          same photograph — and where it is is not up for revision, so this one
          asks for no fix and offers no switch. */}
      <ComposeModal
        isOpen={Boolean(editingMark)}
        mark={editingMark}
        onClose={() => setEditingMark(null)}
        onSaved={markEdited}
      />

      <Modal
        isOpen={Boolean(deletingMark)}
        title={t("marks.deleteTitle")}
        onClose={deletingMarkBusy ? undefined : closeDeleteMark}
        closeOnOverlay
      >
        <p className="modal-text">{t("marks.deleteConfirm", { name: deletingMarkName })}</p>
        {deletingMarkError && <p className="form-message error">{deletingMarkError}</p>}
        <div className="modal-actions">
          <button type="button" className="outline-button" onClick={closeDeleteMark} disabled={deletingMarkBusy}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary-button" onClick={confirmDeleteMark} disabled={deletingMarkBusy}>
            {deletingMarkBusy ? t("marks.deleting") : t("marks.delete")}
          </button>
        </div>
      </Modal>

      {/* Out here for the same reason the composer is: the count that opens this
          is in a bubble on the map, and the map is the whole of the page while it
          is expanded. What is added goes back into the provider's list with the
          new figure on it, which is what the pins are drawn from. */}
      <CommentsModal
        post={commenting}
        onClose={() => setCommenting(null)}
        onAdded={(post, comments) => replacePost({ ...post, comments })}
      />

      {/* Restaurants and cafés use the same conversation sheet. Their count
          goes back to the small venue store shared by the cards and the map,
          rather than to the post provider. */}
      <CommentsModal
        venue={venueCommenting}
        onClose={() => setVenueCommenting(null)}
        onAdded={(venue, comments) => updateVenueComments(venue.kind, venue.id, comments)}
      />

      {/* A Wikipedia landmark's thread, or an old photograph's — one sheet for
          both, because a thread is opened by a row and a row knows its own id.
          The count is put back on whichever shelf the row came off: each of
          the two updates answers only for ids it is holding, so the other is
          a no-op (see utils/wikiPlaces.js and utils/historyPlaces.js). */}
      <CommentsModal
        venue={wikiCommenting}
        onClose={() => setWikiCommenting(null)}
        onAdded={(place, comments) => {
          updateWikiComments(place.id, comments);
          updateHistoryComments(place.id, comments);
        }}
      />

      {/* And the photograph over the lot of it — from the picture in a post's
          bubble, a Wikipedia pin's, or the Wikipedia card's own preview. Out
          here with the sheets above for their reason: both the map and the
          card are container-sized tiles, and the map besides is the whole
          page while it is expanded. `viewing` holds whichever picture was
          pressed; only one of the pair below ever recognises its shape (see
          postPhoto in utils/image.js and wikiPhoto in utils/wikiPlaces.js). */}
      <Lightbox photo={postPhoto(viewing) ?? wikiPhoto(viewing)} onClose={() => setViewing(null)} />
    </div>
  );
}
