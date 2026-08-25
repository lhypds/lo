import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { useSearchParams } from "../../ui/index.js";
import ClockCard from "../ClockCard/index.js";
import Header from "../Header/index.js";
import HereStrip from "../HereStrip/index.js";
import LocationGate from "../LocationGate/index.js";
import MarkButton from "../MarkButton/index.js";
import NearbyCard from "../NearbyCard/index.js";
import WeatherCard from "../WeatherCard/index.js";
import { useHere } from "../LocationProvider/index.js";

// mapbox-gl is by far the heaviest thing lo loads, and the login and gate
// screens both come before any map — so it is fetched only once there is a
// position worth drawing.
const MapCard = lazy(() => import("../MapCard/MapCard.jsx"));

export default function HomePage() {
  const { t } = useTranslation();
  const { coords } = useHere();
  const [params] = useSearchParams();
  const [marks, setMarks] = useState([]);

  const loadMarks = useCallback(() => {
    api
      .getMarks()
      .then((data) => setMarks(data.marks))
      .catch(() => {});
  }, []);

  useEffect(loadMarks, [loadMarks]);

  // Arriving from the marks list as /?focus=<id>: the map pans to that spot
  // instead of the fix, and stops following until asked to recentre.
  const focusId = Number(params.get("focus"));
  const focus = useMemo(
    () => (Number.isInteger(focusId) ? (marks.find((mark) => mark.id === focusId) ?? null) : null),
    [focusId, marks],
  );

  // Nothing below answers a question without a position, so the gate stands in
  // for the whole dashboard rather than appearing inside it.
  if (!coords) return <LocationGate />;

  return (
    <div className="page-shell home-page">
      <Header />
      <main className="home-main" aria-label={t("location.title")}>
        <HereStrip />
        <div className="card-grid">
          <ClockCard />
          <WeatherCard />
          <Suspense fallback={<div className="card-placeholder" />}>
            <MapCard marks={marks} focus={focus} />
          </Suspense>
          <MarkButton
            onMarked={(mark) => setMarks((current) => [mark, ...current])}
            onUnmarked={(mark) => setMarks((current) => current.filter((item) => item.id !== mark.id))}
          />
          <NearbyCard />
        </div>
      </main>
    </div>
  );
}
