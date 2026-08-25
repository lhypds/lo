import { distanceMeters } from "./format.js";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Past this, a route is not a walk however willing Mapbox is to draw one — ask
// it to walk between two cities and it answers with a nine-hour footpath along
// the shoulder of a trunk road. Under it, driving is the wrong answer for the
// opposite reason: a spot two streets away is a walk, and the driving line goes
// the long way round every one-way system to get there.
const WALKING_LIMIT_M = 3000;

export function routeProfile(from, to) {
  return distanceMeters(from, to) <= WALKING_LIMIT_M ? "walking" : "driving";
}

// One leg, from the fix in hand to a spot that was kept. `overview=full` is the
// point of the request: the simplified geometry is drawn for a route card a
// couple of hundred pixels wide and cuts the corner off every turn, which on a
// map you can zoom into reads as a line through the buildings.
//
// The Directions API takes the same public token mapbox-gl already carries, so
// this goes straight from the browser; there is nothing here for the server to
// hold that the bundle does not publish anyway.
export async function fetchRoute(from, to, { signal } = {}) {
  if (!TOKEN) throw new Error("NoToken");
  const profile = routeProfile(from, to);
  const pair = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const query = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    access_token: TOKEN,
  });
  const response = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${pair}?${query}`,
    { signal },
  );
  const data = await response.json().catch(() => ({}));
  const route = data.routes?.[0];
  // A pair of ends the profile cannot connect — an island, the far side of an
  // ocean — comes back 200 with `code: "NoRoute"` and an empty list, so the
  // status on its own is not the answer to whether there is a route.
  if (!response.ok || !route) throw new Error(data.code || "NoRoute");
  return {
    profile,
    geometry: route.geometry,
    distance: route.distance,
    duration: route.duration,
  };
}
