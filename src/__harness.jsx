import { createRoot } from "react-dom/client";
import { Card } from "./ui/index.js";
import WeatherHours from "./components/WeatherCard/WeatherHours.jsx";
import "./styles.css";

const WET = [
  [15, 0, 29, 0], [16, 0, 29, 0], [17, 2, 28, 5], [18, 2, 26, 20], [19, 61, 24, 60],
  [20, 63, 23, 80], [21, 61, 22, 55], [22, 2, 22, 25], [23, 3, 21, 10], [0, 3, 21, 5],
  [1, 3, 20, 5], [2, 3, 20, 0], [3, 3, 19, 0], [4, 3, 19, 0], [5, 2, 19, 0], [6, 0, 20, 0],
  [7, 0, 22, 0], [8, 0, 24, 0], [9, 0, 26, 0], [10, 0, 27, 0], [11, 2, 28, 5], [12, 2, 29, 5],
  [13, 2, 30, 10], [14, 2, 30, 15],
];
const hours = WET.map(([h, weatherCode, temperature, rain], i) => ({
  time: `2026-08-${30 + (i > 8 ? 1 : 0)}T${String(h).padStart(2, "0")}:00`,
  weatherCode, temperature, rain,
}));
const degrees = (v) => (Number.isFinite(v) ? Math.round(v) : null);

function Demo({ width, label }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#666", marginBottom: 6, fontFamily: "monospace" }}>{label} · {width}px</div>
      <div style={{ width, "--tile": `${width}px` }} data-demo={width}>
        <Card title="Weather" meta="30°/19°" square defaultFlipped back={<WeatherHours hours={hours} zone="" degrees={degrees} />}>
          <p style={{ margin: 0 }}>front</p>
        </Card>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <div style={{ display: "flex", gap: 20, padding: 24, alignItems: "flex-start", background: "#f2f2f2" }}>
    <Demo width={286} label="286" />
    <Demo width={230} label="230" />
    <Demo width={178} label="178" />
    <Demo width={143} label="143" />
  </div>,
);
