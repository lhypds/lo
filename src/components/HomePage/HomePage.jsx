import { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";
import ClockCard from "../ClockCard/index.js";
import EventsCard from "../EventsCard/index.js";
import Header from "../Header/index.js";
import HereStrip from "../HereStrip/index.js";
import LocationGate from "../LocationGate/index.js";
import MarkButton from "../MarkButton/index.js";
import NearbyCard from "../NearbyCard/index.js";
import TrendsCard from "../TrendsCard/index.js";
import WeatherCard from "../WeatherCard/index.js";
import { useHere } from "../LocationProvider/index.js";

// mapbox-gl is by far the heaviest thing lo loads, and the login and gate
// screens both come before any map — so it is fetched only once there is a
// position worth drawing.
const MapCard = lazy(() => import("../MapCard/MapCard.jsx"));

export default function HomePage() {
  const { t } = useTranslation();
  const { coords } = useHere();
  // Held here, not in the map: expanding it hides the rest of the dashboard.
  const [mapExpanded, setMapExpanded] = useState(false);

  // Nothing below answers a question without a position, so the gate stands in
  // for the whole dashboard rather than appearing inside it.
  if (!coords) return <LocationGate />;

  return (
    <div className="page-shell home-page">
      <Header />
      {/* Everything but the map is hidden rather than unmounted while it is
          expanded, so collapsing back does not refetch the news or reset what
          the mark button knows about this spot. */}
      <main
        className={mapExpanded ? "home-main home-main-map" : "home-main"}
        aria-label={t("location.title")}
      >
        <HereStrip />
        <div className="card-grid">
          <ClockCard />
          <WeatherCard />
          <Suspense fallback={<div className="card-placeholder" />}>
            {/* No saved marks on this one: the dashboard map answers where you
                are now, and where you have been is the marks page's question. */}
            <MapCard expanded={mapExpanded} onToggleExpanded={() => setMapExpanded((value) => !value)} />
          </Suspense>
          <MarkButton />
          <NearbyCard />
          <EventsCard />
          <TrendsCard />
        </div>
      </main>
    </div>
  );
}
