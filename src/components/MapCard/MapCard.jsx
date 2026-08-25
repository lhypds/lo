import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ActionButton, Card } from "../../ui/index.js";
import { formatCoords } from "../../utils/format.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./map.module.css";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const STYLE_URL = "mapbox://styles/mapbox/standard";
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

const ACCURACY_SOURCE = "lo-accuracy";
const ACCURACY_FILL = "lo-accuracy-fill";
const ACCURACY_LINE = "lo-accuracy-line";

// The accuracy halo as a real polygon rather than a styled circle: a circle
// layer is sized in screen pixels, which would keep the halo the same size as
// the map zooms out of the radius it is supposed to describe.
function accuracyPolygon(latitude, longitude, radiusMeters, steps = 64) {
  const metersPerDegreeLat = 110574;
  const metersPerDegreeLon = 111320 * Math.cos((latitude * Math.PI) / 180);
  const ring = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * 2 * Math.PI;
    ring.push([
      longitude + (radiusMeters * Math.cos(angle)) / Math.max(metersPerDegreeLon, 1e-6),
      latitude + (radiusMeters * Math.sin(angle)) / metersPerDegreeLat,
    ]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

const EMPTY_GEOJSON = { type: "FeatureCollection", features: [] };

function hereElement() {
  const dot = document.createElement("div");
  dot.className = styles.hereDot;
  return dot;
}

function markElement(index) {
  const pin = document.createElement("div");
  pin.className = styles.markDot;
  pin.textContent = String(index);
  return pin;
}

export default function MapCard({ marks = [], focus = null, standalone = false }) {
  const { t, i18n } = useTranslation();
  const { coords } = useHere();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const hereMarkerRef = useRef(null);
  const markMarkersRef = useRef([]);
  const followRef = useRef(true);
  const [expanded, setExpanded] = useState(standalone);
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

    map.on("style.load", () => {
      map.setLanguage(mapLanguage(i18n.language));
      if (!map.getSource(ACCURACY_SOURCE)) {
        map.addSource(ACCURACY_SOURCE, { type: "geojson", data: EMPTY_GEOJSON });
        map.addLayer({
          id: ACCURACY_FILL,
          type: "fill",
          source: ACCURACY_SOURCE,
          paint: { "fill-color": "#000000", "fill-opacity": 0.06 },
        });
        map.addLayer({
          id: ACCURACY_LINE,
          type: "line",
          source: ACCURACY_SOURCE,
          paint: { "line-color": "#000000", "line-width": 1, "line-opacity": 0.35 },
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      hereMarkerRef.current = null;
      markMarkersRef.current = [];
    };
    // Built from the first fix that exists; later ones move it instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.setLanguage(mapLanguage(i18n.language));
  }, [i18n.language]);

  // The blue-dot equivalent: one marker that follows the fix, plus the halo of
  // however sure the device is about it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;
    const position = [coords.longitude, coords.latitude];
    if (!hereMarkerRef.current) {
      hereMarkerRef.current = new mapboxgl.Marker({ element: hereElement() })
        .setLngLat(position)
        .setPopup(new mapboxgl.Popup({ closeButton: false, offset: 14 }).setText(t("map.you")))
        .addTo(map);
    } else {
      hereMarkerRef.current.setLngLat(position);
    }

    const applyAccuracy = () => {
      const source = map.getSource(ACCURACY_SOURCE);
      if (!source) return;
      source.setData(
        Number.isFinite(coords.accuracy) && coords.accuracy > 0
          ? accuracyPolygon(coords.latitude, coords.longitude, coords.accuracy)
          : EMPTY_GEOJSON,
      );
    };
    if (map.isStyleLoaded()) applyAccuracy();
    else map.once("style.load", applyAccuracy);

    if (followRef.current) {
      map.easeTo({ center: position, zoom: Math.max(map.getZoom(), DEFAULT_ZOOM), duration: 600 });
    }
  }, [coords, t]);

  // Saved marks are redrawn wholesale — the list is short, and diffing markers
  // costs more than replacing them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markMarkersRef.current.forEach((marker) => marker.remove());
    markMarkersRef.current = marks.map((mark, index) => {
      const label = mark.label || mark.place || formatCoords(mark.latitude, mark.longitude);
      return new mapboxgl.Marker({ element: markElement(marks.length - index), anchor: "bottom" })
        .setLngLat([mark.longitude, mark.latitude])
        .setPopup(new mapboxgl.Popup({ closeButton: false, offset: 16 }).setText(label))
        .addTo(map);
    });
  }, [marks]);

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
      {live && !standalone && (
        <ActionButton
          tooltip={expanded ? t("map.collapse") : t("map.expand")}
          onClick={() => setExpanded((value) => !value)}
        >
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

  // Square in the grid; expanding trades the square for a tall full-width panel,
  // which is the only way a map this small is any use for looking around.
  return (
    <Card
      title={t("map.title")}
      action={actions}
      square={!expanded}
      wide={expanded}
      flush
      className={expanded ? styles.cardExpanded : undefined}
    >
      {body}
    </Card>
  );
}
