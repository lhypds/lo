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
// Where you are is never asked for by hand: every card on the dashboard is a
// reading of the fix, so once there is one the sensor is read again on this beat
// for as long as the tab is in front. The readings themselves are keyed on a
// rounded fix and do not follow every one of these — walking down the street
// does not change the weather — so this is cheap in everything but the sensor.
const LOCATION_REFRESH_MS = 30 * 1000;
// Trading positions with everyone else is a request per turn rather than a
// sensor read, so it runs on its own slower beat — a map of where people are is
// still only worth as much as the age of the oldest dot on it.
const PRESENCE_REFRESH_MS = 60 * 1000;

// Which cards a country can feed is the server's answer to give — the list lives
// in server/countries.js and arrives with the place name. This is only what the
// page assumes while that first request is in the air: the cards no country has
// ever been without. Anything that stops at a border waits to be named.
const WORLDWIDE_COMPONENTS = ["clock", "weather", "map", "nearby", "events"];

export function LocationProvider({ children }) {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const position = useSyncExternalStore(subscribeLocation, getLocationState);
  const [local, setLocal] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [people, setPeople] = useState([]);
  const [posts, setPosts] = useState([]);
  const [postsError, setPostsError] = useState(null);
  // Bumped by the refresh in the top bar. Cards that ask the server for
  // themselves — the news, what is on, what is trending, the warnings, the
  // marks — key their effect on this alongside the fix, which is how a button
  // that knows nothing about them reaches all of them at once.
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);
  const postsRequestRef = useRef(0);

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

  // The fix keeps itself current. Skipped while the tab is in the background — a
  // dashboard nobody is looking at is not worth waking the GPS for — and caught
  // up the moment it comes back, since by then the position on screen is as old
  // as the time away.
  useEffect(() => {
    if (!hasFix) return undefined;
    const tick = () => {
      if (!document.hidden) refreshLocation();
    };
    const timer = window.setInterval(tick, LOCATION_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [hasFix]);

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

  // Posts belong to the ground rather than to the reader, which makes them a
  // reading of the fix like the place name and the weather are — so they are
  // held here rather than on the two pages that draw them. That is also what
  // lets the refresh in the top bar reach them: the button is in the header, and
  // the header has no idea which page is under it.
  //
  // With no fix there is still an answer worth having, so this asks either way;
  // the server falls back to the newest posts anywhere.
  const loadPosts = useCallback(async (coords) => {
    const ticket = ++postsRequestRef.current;
    try {
      const data = await api.getPosts(coords);
      // A slower earlier request must not overwrite a newer answer — two
      // triggers reach this, the fix moving and the reader asking.
      if (ticket !== postsRequestRef.current) return;
      setPosts(data.posts ?? []);
      setPostsError(null);
    } catch (error) {
      if (ticket !== postsRequestRef.current) return;
      // Kept rather than swallowed: a page that says "nothing around here" when
      // the request actually failed is telling the reader something untrue.
      setPostsError(error);
    }
  }, []);

  useEffect(() => {
    if (!username) return;
    loadPosts(getLocationState().coords);
  }, [key, username, loadPosts]);

  // One turn of the loop: hand over whatever the sensor last read and take back
  // everyone else's. Skipped while the tab is in the background — the server
  // drops a position that stops arriving soon enough anyway, and there is no
  // fresh one to send while the loop above is paused.
  const syncPresence = useCallback(async () => {
    if (document.hidden) return;
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

  // The button in the top bar. Not a request for a fix — that arrives on its own
  // every thirty seconds — but for everything hanging off it: the place name and
  // the weather, who else is out there, what has been left on the ground, and
  // every card that fetches for itself, which is what the token reaches. Whether
  // any of it turns out to be different from what is already on screen is the
  // server's business; the reader asked, so all of it is asked again.
  const refresh = useCallback(async () => {
    const coords = getLocationState().coords;
    setReloadToken((token) => token + 1);
    await Promise.all([load(coords), syncPeople(coords), loadPosts(coords)]);
  }, [load, syncPeople, loadPosts]);

  // A post the reader just wrote, rewrote or deleted, into the list without a
  // round trip: they are looking at the spot it is about.
  const addPost = useCallback((post) => setPosts((current) => [post, ...current]), []);
  const dropPost = useCallback(
    (postId) => setPosts((current) => current.filter((post) => post.id !== postId)),
    [],
  );
  // In place rather than moved to the front: an edit is a second thought about
  // something already left somewhere, not a new post, and the list is ordered by
  // when each one was written.
  const replacePost = useCallback(
    (post) => setPosts((current) => current.map((item) => (item.id === post.id ? post : item))),
    [],
  );

  // The dashboard is not the same dashboard everywhere: Japan has warnings and
  // nowhere else does, half the world's countries have no trending list to show.
  // Every card that reads this asks the same way, so a component that turns out
  // to stop at a border is a line in the server's table and nothing here.
  const components = local?.components ?? WORLDWIDE_COMPONENTS;

  const value = {
    ...position,
    place: local?.place ?? null,
    weather: local?.weather ?? null,
    components,
    supports: (component) => components.includes(component),
    people,
    posts,
    postsError,
    localError,
    loadingLocal,
    enable: enableLocation,
    disable: disableLocation,
    refresh,
    reloadToken,
    reloadLocal: () => load(getLocationState().coords),
    addPost,
    dropPost,
    replacePost,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useHere() {
  return useContext(LocationContext);
}
