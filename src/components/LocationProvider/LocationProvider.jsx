import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import {
  disableLocation,
  enableLocation,
  getLocationState,
  refreshLocation,
  resumeLocation,
  subscribeLocation,
} from "../../utils/location.js";

const LocationContext = createContext(null);

// Ask the server again only once the fix has actually moved. Two decimals is
// about a kilometre — walking down the street does not change the weather.
const COORD_PRECISION = 2;
const WEATHER_REFRESH_MS = 10 * 60 * 1000;

function coordKey(coords) {
  if (!coords) return "";
  return `${coords.latitude.toFixed(COORD_PRECISION)},${coords.longitude.toFixed(COORD_PRECISION)}`;
}

export function LocationProvider({ children }) {
  const { i18n } = useTranslation();
  const position = useSyncExternalStore(subscribeLocation, getLocationState);
  const [local, setLocal] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const requestRef = useRef(0);

  // A grant the browser already remembers means no gate screen at all: the app
  // opens straight onto the dashboard with a fix on its way.
  useEffect(() => {
    resumeLocation();
  }, []);

  const key = coordKey(position.coords);
  const language = i18n.language;

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
    if (!position.coords) return undefined;
    const timer = window.setInterval(() => load(getLocationState().coords), WEATHER_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [key, load, position.coords]);

  const refresh = useCallback(async () => {
    const result = await refreshLocation();
    const coords = getLocationState().coords;
    if (coords) await load(coords);
    return result;
  }, [load]);

  const value = {
    ...position,
    place: local?.place ?? null,
    weather: local?.weather ?? null,
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
