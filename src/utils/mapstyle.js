import { useSyncExternalStore } from "react";
import { noteSetting, registerSetting } from "./settings.js";

// Which face of the ground the map tile is wearing. Three readings of the same
// place: the light map is the quiet one the tile opens on, streets spends more
// ink on buildings and road classes, and satellite keeps labels over the
// photograph so a place stays navigable. A double-click on the card's title walks
// the line (see MapCard).
//
// A store of its own, out here beside the layout and the units rather than inside
// the card, for the two reasons those are: the card is unmounted every time the
// reader leaves the dashboard, so nothing it remembers by itself survives the
// trip — and this is one of the reader's answers about lo, which means it belongs
// to the account and not only to the browser it was given in (see
// utils/settings.js).
const KEY = "lo:map-style";

export const MAP_STYLES = [
  { id: "simple", url: "mapbox://styles/mapbox/light-v11" },
  { id: "detailed", url: "mapbox://styles/mapbox/streets-v12" },
  { id: "satellite", url: "mapbox://styles/mapbox/satellite-streets-v12" },
];

const DEFAULT_ID = MAP_STYLES[0].id;

function read(value) {
  return MAP_STYLES.some((style) => style.id === value) ? value : DEFAULT_ID;
}

function restore() {
  try {
    return read(localStorage.getItem(KEY));
  } catch {
    // Nothing chosen yet, or storage walled off: the quiet face, which is what
    // the tile opens on anyway.
    return DEFAULT_ID;
  }
}

let chosen = restore();
const listeners = new Set();

function subscribe(onChange) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function snapshot() {
  return chosen;
}

function keep(next) {
  if (next === chosen) return;
  chosen = next;
  try {
    localStorage.setItem(KEY, chosen);
  } catch {
    // The choice still holds for this visit when storage is unavailable.
  }
  for (const listener of listeners) listener();
}

// The URL Mapbox is handed, by id. Never the id itself: what the map is told is a
// style URL, and an id that has fallen out of the list above would otherwise be
// handed over as one.
export function mapStyleUrl(id = chosen) {
  return (MAP_STYLES.find((style) => style.id === id) ?? MAP_STYLES[0]).url;
}

// Read once, for the card building its map: the style the canvas is created with
// is not something to re-render over, and every change after it is a subscription
// away (see useMapStyle).
export function mapStyleId() {
  return chosen;
}

export function useMapStyle() {
  return useSyncExternalStore(subscribe, snapshot);
}

// The next face round the ring, which is the whole of what the title's
// double-click does. A ring rather than a menu because there are three of them
// and they are all readings of the same ground: a list to choose from would be a
// sheet over the map to pick which map.
export function cycleMapStyle() {
  const current = MAP_STYLES.findIndex((style) => style.id === chosen);
  keep(MAP_STYLES[(current + 1) % MAP_STYLES.length].id);
  noteSetting("mapStyle", chosen);
}

registerSetting("mapStyle", { read: () => chosen, adopt: (value) => keep(read(value)) });
