import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ActionButton, Card, useNavigate } from "../../ui/index.js";
import { formatCoords, formatDateTime, formatDistance, formatUsername } from "../../utils/format.js";
import { MARK_PIN_EYE, MARK_PIN_PATH, MARK_PIN_TIP_Y, PIN_GLYPHS } from "../../utils/icons.js";
import { directionsLink, searchLink } from "../../utils/maps.js";
import { pickedLang } from "../../utils/lang.js";
import { cycleMapStyle, mapStyleId, mapStyleUrl, useMapStyle } from "../../utils/mapstyle.js";
import { placeName } from "../../utils/place.js";
import { venueParts } from "../../utils/venues.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./map.module.css";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const DEFAULT_ZOOM = 15;

const LANG_MAP = { en: "en", ja: "ja", zh: "zh-Hans" };

// A pick in the switcher wins. Until then the map follows the system: "auto"
// hands the choice to Mapbox, which reads navigator.language — so a machine set
// to Korean gets Korean labels even though lo only ships en/ja/zh. Which is why
// it asks whether a language has been *picked* rather than which one is showing
// (see pickedLang).
function mapLanguage(uiLanguage) {
  if (!pickedLang()) return "auto";
  return LANG_MAP[uiLanguage] ?? "auto";
}

// Near enough anywhere, and the halo is drawn from the accuracy the device
// reports, which is a rough number to begin with.
const METERS_PER_DEGREE_LAT = 110574;

// However sure the device is about the fix, as a marker rather than as a fill
// layer on the canvas: the canvas is under every marker, so a layer put the
// halo behind whichever pin happened to be standing on the same ground. Up here
// it draws over them, and being nothing but a wash is what keeps them readable
// underneath it.
//
// What that costs is the size: a marker is sized in pixels, so the map has to
// be asked how many of them a metre is worth whenever the scale changes, where
// a fill layer got that for free.
// The circle hangs off a wrapper with no size at all, and it is the wrapper that
// is the marker. Mapbox writes `pointer-events: auto` straight onto the element
// it was handed, inline, where no class can outrank it — so the halo, which is
// the widest thing on the map, swallowed every press meant for the pins beneath
// it. A wrapper with no box catches nothing, and the circle inside it is left
// deaf by the stylesheet.
function haloElement() {
  const wrapper = document.createElement("div");
  wrapper.className = styles.halo;
  const disc = document.createElement("div");
  disc.className = styles.haloDisc;
  wrapper.append(disc);
  return wrapper;
}

// Asked of the projection rather than worked out from the zoom, so it stays
// right whatever the map is doing with its own scale.
function haloDiameter(map, latitude, longitude, meters) {
  const centre = map.project([longitude, latitude]);
  const edge = map.project([longitude, latitude + meters / METERS_PER_DEGREE_LAT]);
  return Math.abs(centre.y - edge.y) * 2;
}

// Markers are built by hand rather than rendered, and an <svg> made with
// createElement is an unknown HTML element that draws nothing.
const SVG_NS = "http://www.w3.org/2000/svg";

// The reader's own dot, with their name hanging under it — the one person the
// map draws. The wrapper is exactly the size of the dot so the marker's own
// centring puts the dot on the coordinate; the name is lifted out of the flow
// underneath it, which keeps a long name from dragging the dot off the spot it
// is reporting.
function personElement(username) {
  const wrapper = document.createElement("div");
  wrapper.className = styles.person;
  const dot = document.createElement("div");
  dot.className = styles.personDot;
  const name = document.createElement("span");
  name.className = styles.personName;
  name.textContent = formatUsername(username);
  wrapper.append(dot, name);
  return wrapper;
}

// Everything the map stands on the ground is this one drawing: the pin the rest
// of the app marks a spot with — the button on the dashboard, the link in the
// top bar, all of them from one path — with something in its head to say which
// kind of thing is standing there. A spot the reader kept says it with the plain
// circle, and the other three carry a drawing of what they are (see PIN_GLYPHS
// in utils/icons.js).
//
// One shape and not four, because they are all answering the same question and a
// reader should not have to learn a second alphabet to read a map. The head is
// the whole of what tells them apart — they stand the same size, and what sits
// over what is left to the stack in map.module.css.
//
// What the map adds is where the point goes. The grid runs to 24 and the point
// is at 21, so a marker anchored by the bottom of its box would hang the pin
// three units above the spot it is reporting. The box is cropped to the point
// instead — plus the half of the stroke the round join puts outside it, which is
// the lowest ink there is. Cropping rather than offsetting is what keeps the
// alignment true at whatever size the CSS asks for.
const STROKE_UNITS = 1.2;
const MARK_VIEWBOX = `0 0 24 ${MARK_PIN_TIP_Y + STROKE_UNITS / 2}`;

function pinElement(size, head) {
  const pin = document.createElement("div");
  pin.className = `${styles.pin} ${size}`;
  const drawing = document.createElementNS(SVG_NS, "svg");
  drawing.setAttribute("viewBox", MARK_VIEWBOX);
  drawing.setAttribute("aria-hidden", "true");
  const body = document.createElementNS(SVG_NS, "path");
  body.setAttribute("d", MARK_PIN_PATH);
  drawing.append(body, head);
  pin.append(drawing);
  return pin;
}

// The hole in a plain pin's head. Filled white rather than left hollow like the
// button's copy: on a button the pin sits on a known background, on a map it has
// to carry its own.
function eyeElement() {
  const eye = document.createElementNS(SVG_NS, "circle");
  for (const [name, value] of Object.entries(MARK_PIN_EYE)) eye.setAttribute(name, value);
  return eye;
}

// …and what goes there instead on the pins that are about something. The glyph
// arrives as the shapes it is drawn with rather than as markup, which is what
// lets the post's parts be the same numbers the top bar's button spreads into
// its own JSX: one drawing, read twice, instead of a copy here that nobody
// remembers to change.
function glyphElement(kind) {
  const { transform, parts } = PIN_GLYPHS[kind];
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", styles.pinGlyph);
  group.setAttribute("transform", transform);
  for (const { tag, fill, ...attributes } of parts) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    // One of the pin's own two colours where the part asked for one, and the
    // line drawing it is by default where it did not.
    if (fill) shape.setAttribute("class", fill === "ink" ? styles.ink : styles.paper);
    group.append(shape);
  }
  return group;
}

// The same pin on every saved spot rather than a number: the list is not ordered
// by anything the map can show, so a rank on the pin invites a reading of the
// map that isn't there. What the pin has to say is "a mark is here", and the
// name is a tap away in the popup.
function markElement(label = "") {
  const pin = pinElement(styles.markPin, eyeElement());
  // A name the reader typed stays on the map, the way the people's do: a spot
  // they chose and named is not one they should have to hover to tell from the
  // pin beside it. Only a typed one — a mark left as it was found is wearing the
  // place name the server guessed, and a map already saying "Shinjuku" in its
  // own type does not need lo repeating it on a sticker. That one, and the
  // coordinates and the time with it, is what the bubble is for.
  if (label) {
    const name = document.createElement("span");
    name.className = styles.markName;
    name.textContent = label;
    pin.append(name);
  }
  return pin;
}

// A post carries the picture in a frame the top bar wears, which is the drawing
// lo already uses for "somebody left something here". A mark is a spot the
// reader chose and a post is one they are passing, and that difference is now
// the head's to carry: it used to be said in the size as well, which put it in
// the one dimension that also decides how easily either can be pressed.
function postElement() {
  return pinElement(styles.postPin, glyphElement("post"));
}

// Somewhere to eat or somewhere for coffee, wearing a fork and a cup — the one
// pair on the map that says what it is rather than that it is there, because
// these are the only two kinds standing in the same street as each other.
//
// The ones that sit back, though no longer by being smaller. Everything else the
// map draws is lo's — the reader, where they stood, what they wrote, what they
// kept — and these are the ground itself, which nobody put here. They are also
// the only pins that arrive two dozen at a time, so where two of them want the
// same few pixels as a mark, it is the mark that has to be on top: that is the
// whole of what the stack in map.module.css is for.
function venueElement(kind) {
  return pinElement(styles.venuePin, glyphElement(kind));
}

// Both hand-offs to Google Maps are the same small underlined word, and both are
// real anchors so a phone gives the https URL to the Maps app rather than to a
// tab; on a desktop the same helper opens the page beside lo.
function popupLinkElement(attributes, label, name) {
  const link = document.createElement("a");
  link.className = styles.popupNav;
  link.textContent = label;
  link.setAttribute("aria-label", `${label} ${name}`);
  for (const [key, value] of Object.entries(attributes)) link.setAttribute(key, value);
  // A tap on the link belongs to Google Maps, not to the map underneath, whose
  // click handler would otherwise read it as a request to close the popup.
  link.addEventListener("click", (event) => event.stopPropagation());
  return link;
}

// The one action every kind of pin carries. With no origin in the URL, Maps
// itself uses the device's current position, which is fresher than the fix that
// happened to be on screen when Mapbox built this popup.
function popupNavElement(to, label, name) {
  return popupLinkElement(directionsLink(to), label, name);
}

// And what a mark's bubble asks alongside it: not the way there, but what is
// standing there. A mark is a spot the reader kept — often before they knew what
// was on it — and the coordinates and the place name lo wrote down are the
// beginning of that answer rather than the whole of it. Left of the directions
// link because it is the question that comes first: what is this, then take me
// back to it.
function popupSearchElement(to, label, name) {
  return popupLinkElement(searchLink(to), label, name);
}

// Last on the line, furthest from the two the reader means to press often,
// because it is the one control in a bubble that takes something away. And all
// it does is ask: what it opens is the same confirmation the row in the list
// opens, which is where the deleting is agreed to and done (see MarksPage). A
// bubble is a preview, and no place to be told a thing cannot be undone.
function popupDeleteElement(mark, label, name, remove) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = styles.popupDelete;
  button.textContent = label;
  button.setAttribute("aria-label", `${label} ${name}`);
  button.addEventListener("click", (event) => {
    // Short of the map, which reads a click as "put the chosen bubble away" —
    // the same stop every pressable thing in a bubble makes.
    event.stopPropagation();
    remove(mark);
  });
  return button;
}

// Built out of nodes rather than a string of HTML: the name is whatever the
// reader typed into the rename box, and setHTML would run it.
//
// Under the three lines that say which spot this is, the things that can be done
// with it, in the order they are worth asking: look it up, go to it, be rid of
// it. Three of the four actions the row in the list carries — renaming is the
// one left behind, since a bubble that grew a text field would stop being a
// preview — and they are here because on this page the map is where a mark is
// found. A pin the reader has just picked out of a scatter should not have to be
// found a second time in the list underneath to be acted on.
//
// `remove` is a way to ask for the deleting, or nothing where the page has no
// answer to give — a control that did nothing would be worse than no control.
function markPopupElement(mark, name, coords, iso, when, labels, remove) {
  const wrapper = document.createElement("div");
  wrapper.className = styles.markPopup;
  const label = document.createElement("strong");
  label.textContent = name;
  const position = document.createElement("span");
  position.className = styles.markPopupMeta;
  position.textContent = coords;
  const time = document.createElement("time");
  time.className = styles.markPopupMeta;
  time.dateTime = iso;
  time.textContent = when;
  const actions = document.createElement("span");
  actions.className = styles.markPopupActions;
  actions.append(
    popupSearchElement(mark, labels.search, name),
    popupNavElement(mark, labels.nav, name),
  );
  if (remove) actions.append(popupDeleteElement(mark, labels.remove, name, remove));
  wrapper.append(label, position, time, actions);
  return wrapper;
}

// A place's bubble says what its row in the card says, in the same order: the
// name, what it serves, and how far off it is. Wearing the mark bubble's own
// classes, because it is the same shape of thing — a name with a line or two of
// small print under it — and a second stylesheet for the same box would be two
// boxes to keep looking alike.
//
// The final line carries the same two actions a post does: the public comments
// about the place and the directions hand-off. They remain reachable when the
// venue card itself is on another dashboard page.
function venuePopupElement(venue, note, away, comments, navLabel) {
  const wrapper = document.createElement("div");
  wrapper.className = styles.markPopup;
  const label = document.createElement("strong");
  label.textContent = venue.name;
  wrapper.append(label);
  if (note) {
    const serves = document.createElement("span");
    serves.className = styles.markPopupMeta;
    serves.textContent = note;
    wrapper.append(serves);
  }
  const distance = document.createElement("span");
  distance.className = styles.markPopupMeta;
  distance.textContent = away;
  const actions = document.createElement("span");
  actions.className = styles.postPopupActions;
  if (comments) {
    const open = document.createElement("button");
    open.type = "button";
    open.className = styles.postPopupComments;
    open.textContent = `${comments.label} ${venue.comments ?? 0}`;
    open.addEventListener("click", (event) => {
      event.stopPropagation();
      comments.open(venue);
    });
    actions.append(open);
  }
  actions.append(popupNavElement(venue, navLabel, venue.name));
  wrapper.append(distance, actions);
  return wrapper;
}

// A post's bubble is the row from the list, in the order a passer-by reads it:
// the picture first, since on the map the square was standing in for it, then
// what was written and by whom. It is a preview and not the post — the words
// are clamped and the picture is small — and the click that opens it properly
// is still there underneath.
//
// Three things in a bubble can be pressed and the rest of it stays deaf to the
// pointer — the author's name, the comments count and the navigation link.
//
// The first is the name on the byline, and where it goes is the person: a post
// says somebody was standing here, and who that is, is a fair next question to
// have an answer to. The second is the count in the bottom corner, and what it
// opens is what everyone who came past had to say back — the half of a post that
// does not fit in a bubble 180px wide.
//
// An anchor built by hand, and handed the router's own `navigate` rather than
// reaching for it: this is DOM mapbox owns, outside any React tree, so there is
// no Link to use and no context to read one from. Written as a real href all the
// same, because that is what makes it a name that can be opened in a tab, copied
// or sent to somebody — the press is intercepted, the address is not a pretence.
//
// `comments` is a word and a way to open the sheet, or nothing where the page
// has nowhere to open one — the marks page draws no posts at all, and a count
// nothing answers would be a control that does nothing.
function postPopupElement(post, headline, place, iso, when, navigate, comments, navLabel) {
  const wrapper = document.createElement("div");
  wrapper.className = styles.postPopup;
  if (post.image) {
    const image = document.createElement("img");
    image.className = styles.postPopupImage;
    image.src = post.image;
    // The picture is the post's own content, and the lines under it already say
    // everything about it there is to read out.
    image.alt = "";
    image.loading = "lazy";
    wrapper.append(image);
  }
  const label = document.createElement("strong");
  label.className = styles.postPopupText;
  label.textContent = headline;
  const who = document.createElement("span");
  who.className = styles.markPopupMeta;
  const path = `/${encodeURIComponent(post.username)}`;
  const name = document.createElement("a");
  name.className = styles.postPopupWho;
  name.href = path;
  name.textContent = formatUsername(post.username);
  name.addEventListener("click", (event) => {
    // Short of the map, which reads a click as "put the chosen bubble away" —
    // the reader is going to the person, not dismissing the post.
    event.stopPropagation();
    // What the browser is being asked for by a held modifier or a middle button
    // is a tab or a window, which is the href's business and not ours. The same
    // hand-off Link makes (see ui/Router).
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(path);
  });
  who.append(name);
  // Where the post was left, after the name and in the same grey: the two
  // together are the line the row in the list carries.
  if (place) {
    const at = document.createElement("span");
    at.textContent = ` · ${place}`;
    who.append(at);
  }
  // When it was left remains part of the post's metadata. The things a reader
  // can do sit together on their own line underneath it, so comments and
  // navigation read as one action row rather than as something attached to the
  // timestamp.
  const time = document.createElement("time");
  time.className = styles.markPopupMeta;
  time.dateTime = iso;
  time.textContent = when;
  const actions = document.createElement("span");
  actions.className = styles.postPopupActions;
  if (comments) {
    const open = document.createElement("button");
    open.type = "button";
    open.className = styles.postPopupComments;
    // The word and the figure, and the figure even at nought: a count that
    // stopped being a control when nobody had said anything would read as one
    // that had failed rather than as an invitation to be the first.
    open.textContent = `${comments.label} ${post.comments ?? 0}`;
    open.addEventListener("click", (event) => {
      // Short of the map, which reads a click as "put the chosen bubble away" —
      // the reader is opening the remarks, not dismissing the post. The same
      // stop the byline beside it makes.
      event.stopPropagation();
      comments.open(post);
    });
    actions.append(open);
  }
  actions.append(popupNavElement(post, navLabel, headline));
  wrapper.append(label, who, time, actions);
  return wrapper;
}

// A pointer that can rest on a thing, as against a finger that can only land on
// it. Read once, because a device does not change its mind about this — and it
// is the whole difference between the two ways a bubble is worked below.
const HOVERS = window.matchMedia("(hover: hover)").matches;

// Every bubble on the map, and who is allowed to take it away.
//
// On a touchscreen it is Mapbox's own doing from end to end: a tap on a pin
// opens it, since there is no hover to open anything with, and a tap anywhere
// else — the map, or the bubble, which is deaf to the pointer and lets the tap
// through to the map beneath it — is the way back out. That is what closeOnClick
// is, and there it is the whole dismissal.
//
// Where there is a pointer, closing is ours to do: the bubble follows the pointer
// and a clicked one is kept, neither of which mapbox is in a position to know
// about. Left on, closeOnClick would fire on the click that keeps one — the click
// falls through the bubble onto the map — and shut the very thing it was holding.
// Always above the pin, never flipped under it. Left to itself mapbox picks the
// side with room on it, which means a pin near the top of the tile gets its
// bubble underneath — where it covers the ground the pin is standing on, points
// the wrong way at it, and reads as a different kind of thing than the same
// bubble did a moment ago on the pin below. One side, always, is worth more than
// the few rows of pixels the flip was buying: the offset clears the taller of
// the two pins, so the bubble sits on top of its own pin wherever that pin
// happens to be. Near the top edge it is cropped by the tile instead, which is
// at least the truth about where the pin is.
//
// The offset is measured off the pins in map.module.css, which are all anchored
// by their point and so stand that far up from the spot they report: 25.2px, 28
// wide by the cropped viewBox's ratio. One number covers every kind, which is
// what one size buys — a bubble a pixel clear of the pin is no worse off than
// one resting on it, and the number no longer has to be the tallest of three.
const POPUP_OFFSET = 26;

// An opened bubble is left where it is put rather than being handed the focus.
// Mapbox's own doing otherwise: on open it looks inside for something focusable
// and focuses the first it finds — `a[href]` heads the list it looks for, and in
// a post's bubble that is the byline — so the name came up already focused and
// wearing the browser's ring for it, which is the box around it. A bubble opens
// because a pointer crossed a pin, and that is not somebody asking to be taken
// to the name; with it off the ring is left to mean what it is for, which is a
// reader who tabbed there.
function previewPopup(offset = POPUP_OFFSET) {
  return new mapboxgl.Popup({
    closeButton: false,
    offset,
    anchor: "bottom",
    closeOnClick: !HOVERS,
    focusAfterOpen: false,
  });
}

// Whether the bubble under the pointer is open at all, asked of the popup rather
// than remembered: mapbox closes one when its marker is taken off the map, and
// nothing tells us it happened.
function showing(marker) {
  return Boolean(marker.getPopup()?.isOpen());
}

// The chosen pin, filled in. Crossing a pin already turns it over — black head,
// white line — and this holds that same turn on the one the reader picked, so
// the pin goes on saying "this one" after the pointer has moved off it and after
// its bubble has been lent to whatever the pointer crossed next. Which is the
// half the bubble cannot do: only one of those is up at a time, so with the
// pointer elsewhere there is nothing on the map left pointing at the choice.
//
// A class on the element the marker was built from, rather than anything the
// pin is drawn from again: the pins are DOM nodes the map owns and outlive the
// render that made them, which is why the choice itself is kept in a ref below.
function wearChosen(marker, chosen) {
  marker?.getElement().classList.toggle(styles.pinChosen, chosen);
}

// `expanded` is owned by the page rather than by the map: expanding hides the
// rest of the dashboard, which is not the map's call to make.
//
// The same square tile on both pages: the dashboard passes no marks at all and
// gets the here and now, the marks page passes every saved spot and `fitMarks`
// and gets a history, with the list of them underneath.
export default function MapCard({
  marks = [],
  posts = [],
  // Somewhere to eat and somewhere for coffee, handed in like the other two
  // lists rather than fetched here: which page this map is on decides whether
  // there are any, and that is the page's answer. The dashboard passes whatever
  // the food and café cards have found (see utils/venues.js); the marks page
  // passes nothing, because a page about where the reader has been is not the
  // place to be told where lunch is.
  venues = [],
  focus = null,
  hovered = null,
  fitMarks = false,
  expanded = false,
  onToggleExpanded,
  onHoverPin,
  onSelectPin,
  onOpenComments,
  onOpenVenueComments,
  // Asked for from a mark's bubble, answered by the page: the map says which
  // spot, and the page is where the confirmation stands and where the list it
  // would be taken out of lives. Nothing passed is no delete control at all,
  // which is the dashboard, where the map draws no marks in the first place.
  onDeleteMark,
}) {
  const { t, i18n } = useTranslation();
  const { coords } = useHere();
  const { user } = useAuth();
  // For the byline in a post's bubble, which is hand-built DOM outside the tree
  // and so cannot carry a Link of its own (see postPopupElement)
  const navigate = useNavigate();
  // And for the count beside it. Read through a ref for the reason every other
  // handler on this card is: the listener goes on a node mapbox owns and
  // outlives the render that built it, and the sheet it opens belongs to the
  // page — the card is inside a container-sized tile, which would be the
  // containing block of any fixed box mounted in here.
  const commentsRef = useRef(onOpenComments);
  commentsRef.current = onOpenComments;
  const venueCommentsRef = useRef(onOpenVenueComments);
  venueCommentsRef.current = onOpenVenueComments;
  // And the same for the delete in a mark's bubble, for the same reason: the
  // listener is on a node mapbox owns, and it outlives the render that built it.
  const deleteMarkRef = useRef(onDeleteMark);
  deleteMarkRef.current = onDeleteMark;
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const hereMarkerRef = useRef(null);
  const haloMarkerRef = useRef(null);
  const markMarkersRef = useRef([]);
  const postMarkersRef = useRef([]);
  const venueMarkersRef = useRef([]);
  // Read by the marker handlers, which are attached to DOM nodes the map owns
  // and outlive the render that built them.
  const hoverPinRef = useRef(onHoverPin);
  // Which pin the pointer is on, kept here as well as handed to the page: the
  // handlers have to know whether a mouseleave is still theirs to act on.
  const hoveredRef = useRef(null);
  // The pin whose bubble was opened from the list rather than by the pointer
  // landing on it, which is the only one this card is entitled to close again.
  const openedRef = useRef(null);
  const followRef = useRef(true);
  const fittedRef = useRef(false);
  const [broken, setBroken] = useState(false);
  // Which face the ground is wearing, and it is not this card's to remember: the
  // store keeps it (see utils/mapstyle.js), so the choice survives the trip to
  // another page and crosses to the reader's other devices.
  const style = useMapStyle();
  // What the live canvas is already showing, so the effect below can tell a
  // change from the style the map was created with. The title is interactive from
  // the first render, even in the brief interval before Mapbox has finished
  // creating its canvas — a press in there is remembered by the store and read
  // back when the map is built, rather than lost.
  const shownStyleRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || shownStyleRef.current === style) return;
    shownStyleRef.current = style;
    mapRef.current.setStyle(mapStyleUrl(style));
  }, [style]);

  // Told to the page as an id, which is all it needs to find the row: the pin
  // and the row are the same mark or the same post, and the pin is the half that
  // is hard to read. Whether there is a list to light up at all is the page's
  // business — the dashboard passes nothing and nothing happens.
  //
  // The pointer moving from one pin straight onto its neighbour fires the pin it
  // left after the pin it arrived at, often enough that a leave which cleared
  // whatever it found would put out the row that had only just lit up. So a
  // leaving pin has to still be the one being pointed at to have any say.
  const enterPin = useCallback((id) => {
    hoveredRef.current = id;
    hoverPinRef.current?.(id);
  }, []);

  const leavePin = useCallback((id) => {
    if (hoveredRef.current !== id) return;
    hoveredRef.current = null;
    hoverPinRef.current?.(null);
  }, []);

  const hoverPin = useCallback(
    (id) => (hovering) => (hovering ? enterPin(id) : leavePin(id)),
    [enterPin, leavePin],
  );

  // The one the reader has chosen, by clicking its pin or pressing its row.
  //
  // Hovering is a question asked in passing — the pointer crosses a pin on its
  // way somewhere else — and a bubble that answers it can be taken back the
  // moment the pointer moves on. Choosing is not: it is somebody saying *this
  // one*, so its bubble stays through the mouseleave that would have closed a
  // hovered one, through the pan the press set off, and through a reach across
  // the row for the buttons on the end of it.
  //
  // One bubble at a time — two of them on a 300px tile overlap, and the second is
  // never the one being read — but only one *choice* at a time either, and the
  // two are not the same thing. Hovering something else borrows the bubble: the
  // chosen one steps aside while the pointer is elsewhere and comes back when it
  // leaves, so a reader can run down the rest of the list without losing the row
  // they had picked out. The choice itself only changes when the reader says so —
  // by choosing another one, by pressing the chosen one again, or by a click on
  // the bare map.
  const keptRef = useRef(null);
  // The page hears about it as an id, so the row can show itself as chosen. Held
  // in a ref for the reason the hover callback is: the handlers below are on DOM
  // nodes the map owns, and they outlive the render that built them.
  const selectPinRef = useRef(null);
  // The prop, mirrored, so the press below can ask whether the pointer is on the
  // row it belongs to without the effect having to re-run on every hover.
  const hoveredPropRef = useRef(hovered);
  hoveredPropRef.current = hovered;

  const keep = useCallback((marker, id = null) => {
    const previous = keptRef.current;
    keptRef.current = marker;
    selectPinRef.current?.(id);
    if (previous && previous !== marker) {
      wearChosen(previous, false);
      if (showing(previous)) previous.togglePopup();
    }
    wearChosen(marker, true);
    if (!showing(marker)) marker.togglePopup();
  }, []);

  // The chosen bubble stepping aside while the pointer is on something else, and
  // stepping back when it has gone. Neither touches the choice: they are about
  // which bubble is up, which is a different question from which row is chosen.
  const hide = useCallback(() => {
    const marker = keptRef.current;
    if (marker && showing(marker)) marker.togglePopup();
  }, []);

  const restore = useCallback(() => {
    const marker = keptRef.current;
    if (marker && !showing(marker)) marker.togglePopup();
  }, []);

  // `close` is false when the pointer is still resting on what was chosen:
  // letting go hands the bubble back to the hover that is holding it rather than
  // putting it out from under the reader's own pointer.
  const release = useCallback((close = true) => {
    const marker = keptRef.current;
    keptRef.current = null;
    selectPinRef.current?.(null);
    wearChosen(marker, false);
    if (close && marker && showing(marker)) marker.togglePopup();
  }, []);

  const drop = useCallback(() => release(), [release]);

  // Where there is a pointer, resting it on a pin is a cheaper question than
  // clicking one, so the bubble follows the pointer — and a click holds it.
  //
  // The id is what the page is told, so a list beside the map can light up the
  // row the pin belongs to and show it as chosen. A pin with no row to point at
  // passes none.
  const preview = useCallback(
    (marker, id = null) => {
      if (!HOVERS) return marker;
      const element = marker.getElement();
      const onHover = id === null ? null : hoverPin(id);
      element.addEventListener("mouseenter", () => {
        // Borrowed, not taken: the chosen bubble steps aside for as long as the
        // pointer is on this pin.
        if (keptRef.current !== marker) hide();
        if (!showing(marker)) marker.togglePopup();
        onHover?.(true);
      });
      element.addEventListener("mouseleave", () => {
        // A chosen bubble is the reader's, not the pointer's — this closes only a
        // borrowed one, and hands the map back to whatever was chosen.
        if (keptRef.current !== marker) {
          if (showing(marker)) marker.togglePopup();
          restore();
        }
        onHover?.(false);
      });
      element.addEventListener("click", (event) => {
        // Stopped short of the map, which is where a click means the opposite of
        // this one: off the pins is how a chosen bubble is put away.
        event.stopPropagation();
        // Clicked again — the choice is dropped, and the bubble is left up
        // because the pointer is still on the pin holding it there.
        if (keptRef.current === marker) release(false);
        else keep(marker, id);
      });
      return marker;
    },
    [hide, hoverPin, keep, release, restore],
  );

  // The map is built once and then told about changes; rebuilding it on every
  // new fix would throw away the reader's pan and zoom every few seconds.
  useEffect(() => {
    if (!containerRef.current || !TOKEN) return undefined;
    mapboxgl.accessToken = TOKEN;
    const start = coords ?? { latitude: 35.6895, longitude: 139.7517 };
    // Read rather than subscribed to: the style the canvas is created with is
    // whatever the store holds at that moment, and every change after it reaches
    // the live map through the effect above — which is why the same id is written
    // down here as the one being shown.
    const startStyle = mapStyleId();
    shownStyleRef.current = startStyle;
    let map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: mapStyleUrl(startStyle),
        center: [start.longitude, start.latitude],
        zoom: coords ? DEFAULT_ZOOM : 9,
        // Set here as well as on style.load, so the first tiles already come
        // back localized instead of arriving in English and being reloaded a
        // moment later
        language: mapLanguage(i18n.language),
        attributionControl: false,
      });
    } catch {
      // Mapbox needs WebGL, which a device can refuse for reasons of its own —
      // an old browser, hardware acceleration switched off. Losing the map is
      // no reason to take the clock and the weather down with it.
      setBroken(true);
      return undefined;
    }
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    // The credit, in the corner opposite the zoom: where the ground came from,
    // which is Mapbox's and OpenStreetMap's to be told. Compact, because on a
    // square tile the full line is a sentence across the bottom of the map.
    //
    // The wordmark that mapbox-gl draws in the other corner is taken off in the
    // stylesheet — it is the one control the library adds on its own, and there
    // is no constructor option for it. Mapbox ask for it in their terms of
    // service, so this is a decision about lo rather than a detail of its
    // layout: it is off at the owner's word, and the attribution above — the part
    // that says whose ground this is — is left standing.
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;

    // Any deliberate pan means the reader is looking somewhere else on purpose;
    // recentring is theirs to ask for again from then on.
    const releaseFollow = () => {
      followRef.current = false;
    };
    map.on("dragstart", releaseFollow);
    map.on("zoomstart", (event) => {
      if (event.originalEvent) releaseFollow();
    });

    map.on("style.load", () => map.setLanguage(mapLanguage(i18n.language)));

    // A click anywhere off the pins puts a kept bubble away: every pin stops its
    // own click short of the map, so whatever reaches here was meant for the
    // ground — or fell through the bubble, which is deaf to the pointer, and is
    // the plainest way somebody says they are done with it.
    map.on("click", drop);

    return () => {
      map.remove();
      mapRef.current = null;
      hereMarkerRef.current = null;
      haloMarkerRef.current = null;
      markMarkersRef.current = [];
      postMarkersRef.current = [];
      venueMarkersRef.current = [];
    };
    // Built from the first fix that exists; later ones move it instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.setLanguage(mapLanguage(i18n.language));
  }, [i18n.language]);

  // The blue-dot equivalent, and now the only person on the map: one marker that
  // follows the fix, plus the halo of however sure the device is about it. It
  // still wears the reader's own name — a dot among pins reads as one more thing
  // dropped on the ground until something on it says whose it is, and the name
  // is also the plainest sign of which account this tab is signed in as.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return undefined;
    const name = user?.username ?? "";
    const position = [coords.longitude, coords.latitude];
    if (!hereMarkerRef.current) {
      hereMarkerRef.current = new mapboxgl.Marker({ element: personElement(name) })
        .setLngLat(position)
        .addTo(map);
    } else {
      hereMarkerRef.current.setLngLat(position);
      hereMarkerRef.current.getElement().lastElementChild.textContent = formatUsername(name);
    }

    // No accuracy, no halo: a circle of made-up size is a claim about the fix
    // that the fix itself is not making.
    const spread = Number.isFinite(coords.accuracy) && coords.accuracy > 0 ? coords.accuracy : 0;
    if (!spread) {
      haloMarkerRef.current?.remove();
      haloMarkerRef.current = null;
    } else if (!haloMarkerRef.current) {
      haloMarkerRef.current = new mapboxgl.Marker({ element: haloElement() })
        .setLngLat(position)
        .addTo(map);
    } else {
      haloMarkerRef.current.setLngLat(position);
    }

    // On every frame of a zoom rather than at the end of one: the halo is sized
    // in pixels, and a circle that only caught up when the gesture finished
    // would swell with the map and then snap back.
    const size = () => {
      const disc = haloMarkerRef.current?.getElement().firstElementChild;
      if (!disc) return;
      const diameter = `${haloDiameter(map, coords.latitude, coords.longitude, spread)}px`;
      disc.style.width = diameter;
      disc.style.height = diameter;
    };
    if (spread) size();
    map.on("zoom", size);

    if (followRef.current) {
      map.easeTo({ center: position, zoom: Math.max(map.getZoom(), DEFAULT_ZOOM), duration: 600 });
    }

    return () => map.off("zoom", size);
  }, [coords, user]);

  // Everyone else is not drawn here. The minute loop still trades our fix for
  // the list of who is around — the panel under the map reads it, nearest first,
  // with a distance and an age on every row. What the map was adding to that was
  // a scatter of dots which say who far less well than a line of type does, and
  // which put other people's whereabouts on the same picture as the reader's
  // own; the map is left to the ground and to what was left on it.

  // Saved marks are redrawn wholesale — the list is short, and diffing markers
  // costs more than replacing them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markMarkersRef.current.forEach(({ marker }) => marker.remove());
    // The words on the bubble's action line, and the way to ask for a deleting,
    // built once for the whole redraw rather than per pin — the same shape the
    // posts' comments control below is handed.
    const labels = { search: t("map.search"), nav: t("map.nav"), remove: t("map.delete") };
    const remove = onDeleteMark ? (mark) => deleteMarkRef.current?.(mark) : null;
    // Kept with the id it was drawn for, so a row hovered in the list can be
    // answered by the one pin that belongs to it.
    markMarkersRef.current = marks.map((mark) => {
      const name = mark.label || placeName(mark, i18n.language) || t("marks.unnamed");
      const marker = preview(
        // The label, not `name`: the pin wears only what somebody wrote on it.
        new mapboxgl.Marker({ element: markElement(mark.label || ""), anchor: "bottom" })
          .setLngLat([mark.longitude, mark.latitude])
          .setPopup(
            previewPopup().setDOMContent(
              markPopupElement(
                mark,
                name,
                formatCoords(mark.latitude, mark.longitude),
                mark.time,
                formatDateTime(mark.time, i18n.language),
                labels,
                remove,
              ),
            ),
          )
          .addTo(map),
        mark.id,
      );
      return { id: mark.id, marker };
    });
    // `onDeleteMark` only for whether there is a control at all — which page
    // this is does not change while it is on screen — and the handler itself is
    // read off the ref, so a new one on every render of the page above does not
    // tear every pin on the map down and build it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, t, i18n.language, preview, Boolean(onDeleteMark)]);

  useEffect(() => {
    hoverPinRef.current = onHoverPin;
    selectPinRef.current = onSelectPin;
  }, [onHoverPin, onSelectPin]);

  // Posts, drawn the same wholesale way and for the same reason. The bubble on
  // these is the post: the picture, the words, who left them and when. The
  // square is still where a post is *read* — which is why the list's rows send
  // the map here rather than opening anything — and the one thing behind it is
  // the column of what everyone else said back, which no bubble 180px wide was
  // ever going to hold (see the count in the corner of postPopupElement).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    postMarkersRef.current.forEach(({ marker }) => marker.remove());
    // The word on the count and the way to open the sheet behind it, built once
    // for the whole redraw rather than per pin. Nothing at all where the page
    // has nowhere to open one.
    const comments = onOpenComments
      ? { label: t("comments.short"), open: (post) => commentsRef.current?.(post) }
      : null;
    postMarkersRef.current = posts.map((post) => {
      const element = postElement();
      // The same three things the row in the list carries, chosen the same way:
      // a photo with no words is a whole post, and the line that would have held
      // the words holds where it was taken instead.
      const headline = post.body || post.place || formatCoords(post.latitude, post.longitude);
      // Where it was left goes on the byline beside the name — but only when the
      // headline is the post's own words, since otherwise the headline is that
      // very place and the bubble would say it twice.
      const place = post.body ? post.place : "";
      const marker = preview(
        new mapboxgl.Marker({ element, anchor: "bottom" })
          .setLngLat([post.longitude, post.latitude])
          .setPopup(
            previewPopup().setDOMContent(
              postPopupElement(
                post,
                headline,
                place,
                post.time,
                formatDateTime(post.time, i18n.language),
                navigate,
                comments,
                t("map.nav"),
              ),
            ),
          )
          .addTo(map),
        post.id,
      );
      return { id: post.id, marker };
    });
    // `onOpenComments` only for whether there is a control at all — which page
    // this is does not change while it is on screen — and the handler itself is
    // read off the ref, so a new one on every render of the page above does not
    // tear every pin on the map down and build it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, t, i18n.language, preview, navigate, Boolean(onOpenComments)]);

  // Somewhere to eat and somewhere for coffee, drawn the same wholesale way and
  // for the same reason — two dozen of each at most, and the whole list is
  // replaced every time the reader walks far enough to re-sort it.
  //
  // No id given to `preview`, which the other two both pass. An id is how a pin
  // says which row of a list beside the map it belongs to, and these have no such
  // list: the rows are in a card of their own somewhere else on the grid, quite
  // possibly on another page of the strip. So the pin opens its own bubble and
  // tells the page nothing, which is all there is to tell.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    venueMarkersRef.current.forEach(({ marker }) => marker.remove());
    const comments = onOpenVenueComments
      ? { label: t("comments.short"), open: (venue) => venueCommentsRef.current?.(venue) }
      : null;
    venueMarkersRef.current = venues.map((venue) => {
      const { category, cuisine } = venueParts(venue, t);
      const marker = preview(
        new mapboxgl.Marker({ element: venueElement(venue.kind), anchor: "bottom" })
          .setLngLat([venue.longitude, venue.latitude])
          .setPopup(
            previewPopup().setDOMContent(
              venuePopupElement(
                venue,
                [category, cuisine].filter(Boolean).join(" · "),
                formatDistance(venue.distance),
                comments,
                t("map.nav"),
              ),
            ),
          )
          .addTo(map),
      );
      return { id: venue.id, marker };
    });
  }, [venues, t, preview, Boolean(onOpenVenueComments)]);

  // The pairing the other way round: a row under the pointer in the list opens
  // the bubble on its own pin, so whichever half the reader is looking at, the
  // other half answers. It runs after both draws above — a page has only one kind
  // of pin on it, so the two lists are searched as one — and again when they are
  // redrawn, which is what puts the bubble back on the pin that replaced the one
  // the reader was resting on.
  //
  // Only ever the bubble it opened itself gets closed again. A bubble opened any
  // other way is not this effect's to shut: on a touchscreen a tap is the only
  // way to open one at all, and an effect that closed whatever it found open
  // would take it away again on the next render.
  useEffect(() => {
    const pins = [...markMarkersRef.current, ...postMarkersRef.current];
    const markerFor = (id) => pins.find((pin) => pin.id === id)?.marker;
    if (openedRef.current !== null && openedRef.current !== hovered) {
      const marker = markerFor(openedRef.current);
      // Unless the row was pressed as well as pointed at, which keeps the bubble:
      // this effect opened it, but it is not this effect's any more.
      if (marker && marker !== keptRef.current && showing(marker)) marker.togglePopup();
      openedRef.current = null;
    }
    // Nothing under the pointer: whatever was chosen has the map back.
    if (hovered === null) {
      restore();
      return;
    }
    const marker = markerFor(hovered);
    // A row under the pointer borrows the bubble from the chosen one, which is
    // put back the moment the pointer leaves. One bubble at a time; the choice
    // itself is not something a passing pointer gets to change.
    if (marker !== keptRef.current) hide();
    // Already open means the pointer is on the pin itself rather than on the row,
    // and the pin closes its own bubble when the pointer leaves it.
    if (marker && !showing(marker)) {
      marker.togglePopup();
      openedRef.current = hovered;
    }
  }, [hovered, marks, posts, hide, restore]);

  // A list map opens on the whole list: one fit over every pin it was given, so
  // a mark left in another city — or a post two suburbs over — is on screen
  // without anyone having to go and look for it. It happens once, on the first
  // list that has anything in it; after that the view belongs to the reader, and
  // following the fix is off for the same reason a deliberate pan turns it off.
  useEffect(() => {
    const map = mapRef.current;
    const pins = [...marks, ...posts];
    if (!map || !fitMarks || fittedRef.current || pins.length === 0) return;
    fittedRef.current = true;
    followRef.current = false;
    const bounds = new mapboxgl.LngLatBounds();
    pins.forEach((pin) => bounds.extend([pin.longitude, pin.latitude]));
    if (coords) bounds.extend([coords.longitude, coords.latitude]);
    // Capped, or a lone pin would be fitted to a rooftop; the padding keeps the
    // outermost ones clear of the edges of the card.
    map.fitBounds(bounds, { padding: 48, maxZoom: DEFAULT_ZOOM, duration: 0 });
  }, [fitMarks, marks, posts, coords]);

  // Arriving from the list with one spot in mind, which is a row that has been
  // pressed — or a post named in the address bar, arrived at from the dashboard.
  //
  // The bubble goes up with the pan and stays up. Pressing a row is the same
  // deliberate "this one" as clicking the pin itself, and a preview that went out
  // the moment the pointer left the row would be the map answering the question
  // and then taking the answer back — with the row's own actions sitting a few
  // pixels away, that is most of the time.
  //
  // Pressing the chosen row again lets it go, exactly as a second click on its
  // pin does. The bubble is left up if the pointer is still on that row, since
  // from then on the row is holding it the way any hovered row does; if the press
  // came from somewhere else — an address bar carrying a post id — there is
  // nobody holding it and it goes out.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    followRef.current = false;

    const marker = [...markMarkersRef.current, ...postMarkersRef.current].find(
      (pin) => pin.id === focus.id,
    )?.marker;
    if (marker) {
      if (keptRef.current === marker) {
        const held = hoveredPropRef.current === focus.id;
        release(!held);
        // Handed back to the hover that is holding it, which is what closes it
        // when the pointer finally leaves the row.
        if (held) openedRef.current = focus.id;
      } else {
        keep(marker, focus.id);
      }
    }

    // The pan is aimed at the middle of the map and nowhere else. The chosen spot
    // is what was asked for, so that is what goes under the centre of the tile —
    // it used to be pushed down by half the bubble's height, to leave the preview
    // the room above it, and the cost was that the pin never landed where the eye
    // was already waiting for it. Two rows pressed in turn moved the map by
    // different amounts, since the two bubbles are different heights. The bubble
    // can be cropped by the top edge; where the pin is cannot be argued with.
    map.easeTo({
      center: [focus.longitude, focus.latitude],
      zoom: 16,
      duration: 700,
    });
  }, [focus, keep, release]);

  function recenter() {
    const map = mapRef.current;
    if (!map || !coords) return;
    followRef.current = true;
    map.easeTo({ center: [coords.longitude, coords.latitude], zoom: DEFAULT_ZOOM, duration: 600 });
  }

  // A resized container is a new viewport as far as Mapbox is concerned, and it
  // only finds out when told. The tile is square, so it changes size on every
  // rotation and every step of the expand animation, not just on mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [broken]);

  const live = TOKEN && !broken;
  // Redrawing the pins — a search narrowing the list, a reload bringing a new
  // one — throws away the element the pointer was resting on, and an element
  // that has gone never fires its mouseleave. Leaving the map is the one thing
  // that is certain to be noticed, so it is the backstop that puts the row out.
  const body = live ? (
    <div className={styles.wrapper} onMouseLeave={() => leavePin(hoveredRef.current)}>
      <div ref={containerRef} className={styles.container} />
    </div>
  ) : (
    <p className={styles.noToken}>{TOKEN ? t("map.unavailable") : t("map.noToken")}</p>
  );

  const actions = (
    <span className={styles.actions}>
      {live && coords && (
        <ActionButton tooltip={t("map.recenter")} onClick={recenter}>
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3.5" />
            <circle cx="12" cy="12" r="8" />
            <path d="M12 1.5V4" />
            <path d="M12 20v2.5" />
            <path d="M1.5 12H4" />
            <path d="M20 12h2.5" />
          </svg>
        </ActionButton>
      )}
      {live && onToggleExpanded && (
        <ActionButton tooltip={expanded ? t("map.collapse") : t("map.expand")} onClick={onToggleExpanded}>
          {expanded ? (
            <svg viewBox="0 0 24 24">
              <path d="M9 3v6H3" />
              <path d="M15 21v-6h6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M15 3h6v6" />
              <path d="M9 21H3v-6" />
              <path d="M21 3l-7 7" />
              <path d="M3 21l7-7" />
            </svg>
          )}
        </ActionButton>
      )}
    </span>
  );

  // Square in the grid; expanding trades the square for the whole window, which
  // is the only way a map this small is any use for looking around. `map-full`
  // is the hook the page hides everything else by, so it is deliberately global.
  return (
    <Card
      title={t("map.title")}
      action={actions}
      cycleHint={t("map.turn")}
      onCycle={cycleMapStyle}
      square={!expanded}
      wide={expanded}
      flush
      className={expanded ? `map-full ${styles.cardExpanded}` : undefined}
    >
      {body}
    </Card>
  );
}
