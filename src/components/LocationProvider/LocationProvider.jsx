import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { useAuth } from "../AuthProvider/index.js";
import {
  coordKey,
  disableLocation,
  enableLocation,
  getLocationState,
  refreshLocation,
  resumeLocation,
  subscribeLocation,
} from "../../utils/location.js";

const LocationContext = createContext(null);

const WEATHER_REFRESH_MS = 10 * 60 * 1000;
// Once there is a fix the sensor is read again every minute, and the new one is
// traded for everyone else's on the same beat — a map of where people are is
// only worth as much as the age of the oldest dot on it.
const PRESENCE_REFRESH_MS = 60 * 1000;

export function LocationProvider({ children }) {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const position = useSyncExternalStore(subscribeLocation, getLocationState);
  const [local, setLocal] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [people, setPeople] = useState([]);
  const requestRef = useRef(0);

  // A grant the browser already remembers means no gate screen at all: the app
  // opens straight onto the dashboard with a fix on its way.
  useEffect(() => {
    resumeLocation();
  }, []);

  const key = coordKey(position.coords);
  const language = i18n.language;
  // The timers below start once there is a fix and run until there is not; the
  // fix itself is a new object every reading, which would restart them.
  const hasFix = Boolean(position.coords);
  const username = user?.username ?? null;

  const load = useCallback(
    async (coords) => {
      if (!coords) return;
      const ticket = ++requestRef.current;
      setLoadingLocal(true);
      try {
        const data = await api.getLocal(coords);
        // A slower earlier request must not overwrite a newer answer.
        if (ticket !== requestRef.current) return;
        setLocal(data);
        setLocalError(null);
      } catch (error) {
        if (ticket !== requestRef.current) return;
        setLocalError(error);
      } finally {
        if (ticket === requestRef.current) setLoadingLocal(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!position.coords) return;
    load(position.coords);
    // key and language are what make this a new question; coords itself changes
    // on every jitter of the sensor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, language, load]);

  // Weather goes stale where a place name does not, so the same call is made
  // again on a timer while the tab stays open.
  useEffect(() => {
    if (!hasFix) return undefined;
    const timer = window.setInterval(() => load(getLocationState().coords), WEATHER_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [hasFix, load]);

  // Hand the current fix to the server and take back everyone else's. With no
  // fix of our own there is nothing to trade, but the others are still worth
  // drawing — so that case asks rather than publishes.
  const syncPeople = useCallback(async (coords) => {
    try {
      const data = coords ? await api.publishPosition(coords) : await api.getPeople();
      setPeople(data.people ?? []);
    } catch {
      // Losing sight of the others is no reason to lose your own position
    }
  }, []);

  // One turn of the loop: read the sensor again, then trade. Skipped while the
  // tab is in the background — a hidden map is not worth waking the GPS for,
  // and the server drops a position that stops arriving soon enough anyway.
  const syncPresence = useCallback(async () => {
    if (document.hidden) return;
    await refreshLocation();
    await syncPeople(getLocationState().coords);
  }, [syncPeople]);

  // First contact — on sign-in, and again on every move worth a new place name.
  // Signed out there is nobody to be on the map with, and the server would only
  // answer with a 401 anyway.
  useEffect(() => {
    if (!username) return;
    syncPeople(getLocationState().coords);
  }, [key, username, syncPeople]);

  useEffect(() => {
    if (!hasFix || !username) return undefined;
    const timer = window.setInterval(syncPresence, PRESENCE_REFRESH_MS);
    // Coming back to a backgrounded tab, the dots on screen are as old as the
    // time away — catching up is the first thing that should happen.
    document.addEventListener("visibilitychange", syncPresence);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncPresence);
    };
  }, [hasFix, username, syncPresence]);

  const refresh = useCallback(async () => {
    const result = await refreshLocation();
    const coords = getLocationState().coords;
    if (coords) await load(coords);
    // Asking for a fresh fix by hand is also asking for a fresh map
    syncPeople(coords);
    return result;
  }, [load, syncPeople]);

  const value = {
    ...position,
    place: local?.place ?? null,
    weather: local?.weather ?? null,
    people,
    localError,
    loadingLocal,
    enable: enableLocation,
    disable: disableLocation,
    refresh,
    reloadLocal: () => load(getLocationState().coords),
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useHere() {
  return useContext(LocationContext);
}
