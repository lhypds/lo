import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ActionButton, Card } from "../../ui/index.js";
import { formatCoords, formatDateTime, formatUsername } from "../../utils/format.js";
import { MARK_PIN_EYE, MARK_PIN_PATH, MARK_PIN_TIP_Y } from "../../utils/icons.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
// The opener rather than the sheet: this file is the one lo loads lazily, and
// naming the component here would pull it and everything under it into the map's
// own chunk to no purpose — the sheet is already mounted by the top bar.
import { openProfile } from "../UserModal/userApi.js";
import styles from "./map.module.css";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// Light rather than Standard on every map lo draws. Standard spends its ink on
// things none of these are big enough to say: extruded buildings, terrain
// shading, a lit 3D scene. Light is the flat grey-and-white basemap underneath
// all that — roads and names, nothing else — which is both what a 300px tile
// has room for and what the rest of the app looks like. The pins are the only
// thing on any of these maps worth looking at twice, and a quiet ground is what
// leaves them somewhere to stand.
const STYLE_URL = "mapbox://styles/mapbox/light-v11";
const DEFAULT_ZOOM = 15;

const LANG_MAP = { en: "en", ja: "ja", zh: "zh-Hans" };

// A pick in the switcher wins. Until then the map follows the system: "auto"
// hands the choice to Mapbox, which reads navigator.language — so a machine set
// to Korean gets Korean labels even though lo only ships en/ja/zh.
function mapLanguage(uiLanguage) {
  try {
    if (!localStorage.getItem("lang")) return "auto";
  } catch {
    return "auto";
  }
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

// The same glyph on every saved spot rather than a number: the list is not
// ordered by anything the map can show, so a rank on the pin invites a reading
// of the map that isn't there. What the pin has to say is "a mark is here", and
// the name is a tap away in the popup.
//
// It says it with the drawing the rest of the app marks a spot with — the button
// on the dashboard, the link in the top bar, all three from one path — where a
// post, which has no drawing of its own anywhere, keeps its letter. It stands on
// its own with no box behind it: the square it used to sit in was a second shape
// competing with the one that means something.
//
// What the map adds is where the point goes. The grid runs to 24 and the point
// is at 21, so a marker anchored by the bottom of its box would hang the pin
// three units above the spot it is reporting. The box is cropped to the point
// instead — plus the half of the stroke the round join puts outside it, which is
// the lowest ink there is. Cropping rather than offsetting is what keeps the
// alignment true at whatever size the CSS asks for.
const STROKE_UNITS = 1.2;
const MARK_VIEWBOX = `0 0 24 ${MARK_PIN_TIP_Y + STROKE_UNITS / 2}`;

function markElement(label = "") {
  const pin = document.createElement("div");
  pin.className = styles.markPin;
  const glyph = document.createElementNS(SVG_NS, "svg");
  glyph.setAttribute("viewBox", MARK_VIEWBOX);
  glyph.setAttribute("aria-hidden", "true");
  const body = document.createElementNS(SVG_NS, "path");
  body.setAttribute("d", MARK_PIN_PATH);
  // Filled white rather than left hollow like the button's copy: on a button the
  // pin sits on a known background, on a map it has to carry its own.
  const eye = document.createElementNS(SVG_NS, "circle");
  for (const [name, value] of Object.entries(MARK_PIN_EYE)) eye.setAttribute(name, value);
  glyph.append(body, eye);
  pin.append(glyph);
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

// A post is the same square saying p — the two are the same size of thing on
// the map, and what differs is only what opens when one is pressed.
function postElement() {
  const pin = document.createElement("div");
  pin.className = styles.postDot;
  pin.textContent = "p";
  return pin;
}

// Built out of nodes rather than a string of HTML: the name is whatever the
// reader typed into the rename box, and setHTML would run it.
function markPopupElement(name, coords, iso, when) {
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
  wrapper.append(label, position, time);
  return wrapper;
}

// A post's bubble is the row from the list, in the order a passer-by reads it:
// the picture first, since on the map the square was standing in for it, then
// what was written and by whom. It is a preview and not the post — the words
// are clamped and the picture is small — and the click that opens it properly
// is still there underneath.
//
// The name on the byline is the one thing in a bubble that can be pressed, and
// what it opens is the person: a post says somebody was standing here, and who
// that is, is a fair next question to have an answer to. Everything else in here
// stays deaf to the pointer — see .postPopupWho in map.module.css, which is the
// one hole in that.
function postPopupElement(post, headline, place, iso, when) {
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
  const name = document.createElement("button");
  name.type = "button";
  name.className = styles.postPopupWho;
  name.textContent = formatUsername(post.username);
  name.addEventListener("click", (event) => {
    // Short of the map, which reads a click as "put the chosen bubble away" —
    // the reader is opening the person, not dismissing the post.
    event.stopPropagation();
    openProfile(post.username);
  });
  who.append(name);
  // Where the post was left, after the name and in the same grey: the two
  // together are the line the row in the list carries.
  if (place) {
    const at = document.createElement("span");
    at.textContent = ` · ${place}`;
    who.append(at);
  }
  const time = document.createElement("time");
  time.className = styles.markPopupMeta;
  time.dateTime = iso;
  time.textContent = when;
  wrapper.append(label, who, time);
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
// the few rows of pixels the flip was buying: the pins are 16 and 18px tall and
// the offset clears both, so the bubble sits on top of its own pin wherever that
// pin happens to be. Near the top edge it is cropped by the tile instead, which
// is at least the truth about where the pin is.
function previewPopup(offset) {
  return new mapboxgl.Popup({ closeButton: false, offset, anchor: "bottom", closeOnClick: !HOVERS });
}

// Whether the bubble under the pointer is open at all, asked of the popup rather
// than remembered: mapbox closes one when its marker is taken off the map, and
// nothing tells us it happened.
function showing(marker) {
  return Boolean(marker.getPopup()?.isOpen());
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
  focus = null,
  hovered = null,
  fitMarks = false,
  expanded = false,
  onToggleExpanded,
  onHoverPin,
  onSelectPin,
}) {
  const { t, i18n } = useTranslation();
  const { coords } = useHere();
  const { user } = useAuth();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const hereMarkerRef = useRef(null);
  const haloMarkerRef = useRef(null);
  const markMarkersRef = useRef([]);
  const postMarkersRef = useRef([]);
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
    if (previous && previous !== marker && showing(previous)) previous.togglePopup();
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
    let map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLE_URL,
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
    // Kept with the id it was drawn for, so a row hovered in the list can be
    // answered by the one pin that belongs to it.
    markMarkersRef.current = marks.map((mark) => {
      const name = mark.label || mark.place || t("marks.unnamed");
      const marker = preview(
        // The label, not `name`: the pin wears only what somebody wrote on it.
        new mapboxgl.Marker({ element: markElement(mark.label || ""), anchor: "bottom" })
          .setLngLat([mark.longitude, mark.latitude])
          .setPopup(
            previewPopup(16).setDOMContent(
              markPopupElement(
                name,
                formatCoords(mark.latitude, mark.longitude),
                mark.time,
                formatDateTime(mark.time, i18n.language),
              ),
            ),
          )
          .addTo(map),
        mark.id,
      );
      return { id: mark.id, marker };
    });
  }, [marks, t, i18n.language, preview]);

  useEffect(() => {
    hoverPinRef.current = onHoverPin;
    selectPinRef.current = onSelectPin;
  }, [onHoverPin, onSelectPin]);

  // Posts, drawn the same wholesale way and for the same reason. The bubble on
  // these is the post: the picture, the words, who left them and when. There is
  // no sheet behind it to open — the square is where a post is read, which is
  // also why the list's rows send the map here rather than opening anything.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    postMarkersRef.current.forEach(({ marker }) => marker.remove());
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
            previewPopup(16).setDOMContent(
              postPopupElement(
                post,
                headline,
                place,
                post.time,
                formatDateTime(post.time, i18n.language),
              ),
            ),
          )
          .addTo(map),
        post.id,
      );
      return { id: post.id, marker };
    });
  }, [posts, i18n.language, preview]);

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

    // The pan is aimed under the middle of the map rather than at it, because the
    // pin is not the whole of what has to be looked at: the bubble stands on top
    // of it, so a pin put dead centre hangs its preview over the top half of the
    // tile and, on the small square, off the top of it. Half the bubble's height
    // below centre lands the pair of them on the middle instead — the pin low,
    // the preview filling the room above it.
    //
    // Measured off the bubble that is now up rather than guessed at: a post
    // carrying a photo is three times the height of a mark's three lines, and the
    // photo's own box is a fixed 96px, so this is a true number before the
    // picture itself has arrived.
    const bubble = marker && showing(marker) ? marker.getPopup().getElement() : null;
    map.easeTo({
      center: [focus.longitude, focus.latitude],
      zoom: 16,
      offset: [0, (bubble?.offsetHeight ?? 0) / 2],
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
      square={!expanded}
      wide={expanded}
      flush
      quietHead
      className={expanded ? `map-full ${styles.cardExpanded}` : undefined}
    >
      {body}
    </Card>
  );
}
