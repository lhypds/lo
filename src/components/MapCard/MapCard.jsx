import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ActionButton, Card } from "../../ui/index.js";
import { formatCoords, formatDateTime, formatUsername, relativeTime } from "../../utils/format.js";
import { MARK_PIN_EYE, MARK_PIN_PATH, MARK_PIN_TIP_Y } from "../../utils/icons.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
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

// One dot per person, with the name hanging under it. The wrapper is exactly
// the size of the dot so the marker's own centring puts the dot on the
// coordinate; the name is lifted out of the flow underneath it, which keeps a
// long name from dragging the dot off the spot it is reporting.
function personElement(username, self = false) {
  const wrapper = document.createElement("div");
  wrapper.className = self ? `${styles.person} ${styles.personSelf}` : styles.person;
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
function postPopupElement(post, headline, byline, iso, when) {
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
  who.textContent = byline;
  const time = document.createElement("time");
  time.className = styles.markPopupMeta;
  time.dateTime = iso;
  time.textContent = when;
  wrapper.append(label, who, time);
  return wrapper;
}

// Everything on the map that carries a bubble opens it on a click, which is
// Mapbox's own doing and is the only answer a touchscreen has — there is no
// hover there to open anything with. Where there is a pointer, resting it on a
// pin is a cheaper question than clicking one, so the bubble follows the pointer
// instead and the click is left to mean what it means elsewhere: on a post it
// opens the post. It is also stopped short of the map, which would otherwise
// read it as a second toggle and shut the bubble the pointer is holding open.
function previewOnHover(marker) {
  if (!window.matchMedia("(hover: hover)").matches) return marker;
  const element = marker.getElement();
  element.addEventListener("mouseenter", () => {
    if (!marker.getPopup()?.isOpen()) marker.togglePopup();
  });
  element.addEventListener("mouseleave", () => {
    if (marker.getPopup()?.isOpen()) marker.togglePopup();
  });
  element.addEventListener("click", (event) => event.stopPropagation());
  return marker;
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
  fitMarks = false,
  expanded = false,
  onToggleExpanded,
  onSelectPost,
}) {
  const { t, i18n } = useTranslation();
  const { coords, people = [] } = useHere();
  const { user } = useAuth();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const hereMarkerRef = useRef(null);
  const haloMarkerRef = useRef(null);
  const peopleMarkersRef = useRef([]);
  const markMarkersRef = useRef([]);
  const postMarkersRef = useRef([]);
  // Read by the marker handlers, which are attached to DOM nodes the map owns
  // and outlive the render that built them.
  const selectPostRef = useRef(onSelectPost);
  const followRef = useRef(true);
  const fittedRef = useRef(false);
  const [broken, setBroken] = useState(false);

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

    return () => {
      map.remove();
      mapRef.current = null;
      hereMarkerRef.current = null;
      haloMarkerRef.current = null;
      peopleMarkersRef.current = [];
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

  // The blue-dot equivalent: one marker that follows the fix, plus the halo of
  // however sure the device is about it. It carries the reader's own name for
  // the same reason everyone else's does — on a map with several dots on it,
  // "you are here" is only useful if the others say who they are too.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return undefined;
    const name = user?.username ?? "";
    const position = [coords.longitude, coords.latitude];
    if (!hereMarkerRef.current) {
      hereMarkerRef.current = new mapboxgl.Marker({ element: personElement(name, true) })
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

  // Everyone else, redrawn wholesale on each round of the minute loop. The list
  // is only ever the handful of people whose tabs are open, and it arrives as a
  // new array every time, so diffing it would cost more than replacing it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    peopleMarkersRef.current.forEach((marker) => marker.remove());
    peopleMarkersRef.current = people.map((person) =>
      previewOnHover(
        new mapboxgl.Marker({ element: personElement(person.username) })
          .setLngLat([person.longitude, person.latitude])
          .setPopup(
            // The name is already on the label; what the label cannot say is how
            // long ago the dot was true, which is the whole question here.
            new mapboxgl.Popup({ closeButton: false, offset: 14 }).setText(
              t("map.seen", { time: relativeTime(person.time, i18n.language, t) }),
            ),
          )
          .addTo(map),
      ),
    );
  }, [people, t, i18n.language]);

  // Saved marks are redrawn wholesale — the list is short, and diffing markers
  // costs more than replacing them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markMarkersRef.current.forEach((marker) => marker.remove());
    markMarkersRef.current = marks.map((mark) => {
      const name = mark.label || mark.place || t("marks.unnamed");
      return previewOnHover(
        // The label, not `name`: the pin wears only what somebody wrote on it.
        new mapboxgl.Marker({ element: markElement(mark.label || ""), anchor: "bottom" })
          .setLngLat([mark.longitude, mark.latitude])
          .setPopup(
            new mapboxgl.Popup({ closeButton: false, offset: 16 }).setDOMContent(
              markPopupElement(
                name,
                formatCoords(mark.latitude, mark.longitude),
                mark.time,
                formatDateTime(mark.time, i18n.language),
              ),
            ),
          )
          .addTo(map),
      );
    });
  }, [marks, t, i18n.language]);

  useEffect(() => {
    selectPostRef.current = onSelectPost;
  }, [onSelectPost]);

  // Posts, drawn the same wholesale way and for the same reason. The bubble on
  // these is a preview and nothing more — a post is words and a photo, which is
  // more than a bubble on a 300px tile can hold — so it says enough to tell one
  // square from the next, and pressing one still opens it properly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    postMarkersRef.current.forEach((marker) => marker.remove());
    postMarkersRef.current = posts.map((post) => {
      const element = postElement();
      element.addEventListener("click", () => selectPostRef.current?.(post));
      // The same three things the row in the list carries, chosen the same way:
      // a photo with no words is a whole post, and the line that would have held
      // the words holds where it was taken instead.
      const headline = post.body || post.place || formatCoords(post.latitude, post.longitude);
      const byline = [formatUsername(post.username), post.body ? post.place : ""]
        .filter(Boolean)
        .join(" · ");
      return previewOnHover(
        new mapboxgl.Marker({ element, anchor: "bottom" })
          .setLngLat([post.longitude, post.latitude])
          .setPopup(
            new mapboxgl.Popup({ closeButton: false, offset: 16 }).setDOMContent(
              postPopupElement(
                post,
                headline,
                byline,
                post.time,
                formatDateTime(post.time, i18n.language),
              ),
            ),
          )
          .addTo(map),
      );
    });
  }, [posts, i18n.language]);

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

  // Arriving from the marks list with one spot in mind.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    followRef.current = false;
    map.easeTo({ center: [focus.longitude, focus.latitude], zoom: 16, duration: 700 });
  }, [focus]);

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
  const body = live ? (
    <div className={styles.wrapper}>
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
