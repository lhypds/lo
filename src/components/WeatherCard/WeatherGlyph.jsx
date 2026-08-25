// One 24×24 line drawing per weather shape, in the same stroke language as
// every other icon in the app — no icon font, no colour, no fill.
const SUN = <circle cx="12" cy="12" r="4" />;
const SUN_RAYS = (
  <>
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.9 4.9 1.4 1.4" />
    <path d="m17.7 17.7 1.4 1.4" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m4.9 19.1 1.4-1.4" />
    <path d="m17.7 6.3 1.4-1.4" />
  </>
);
const CLOUD = <path d="M7 18h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-.9A3.6 3.6 0 0 0 7 18z" />;
const SMALL_CLOUD = <path d="M9 17h8a3 3 0 0 0 .2-6 4.3 4.3 0 0 0-8-.8A3 3 0 0 0 9 17z" />;

const GLYPHS = {
  clear: (
    <>
      {SUN}
      {SUN_RAYS}
    </>
  ),
  "partly-cloudy": (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 2v1.6" />
      <path d="M2 8h1.6" />
      <path d="m3.8 3.8 1.1 1.1" />
      <path d="m12.2 3.8-1.1 1.1" />
      {SMALL_CLOUD}
    </>
  ),
  cloudy: CLOUD,
  fog: (
    <>
      <path d="M7 14h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-.9A3.6 3.6 0 0 0 7 14z" />
      <path d="M4 18h16" />
      <path d="M7 21h10" />
    </>
  ),
  rain: (
    <>
      <path d="M7 15h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-.9A3.6 3.6 0 0 0 7 15z" />
      <path d="M9 18.5 8 21" />
      <path d="M13 18.5 12 21" />
      <path d="M17 18.5 16 21" />
    </>
  ),
  snow: (
    <>
      <path d="M7 15h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-.9A3.6 3.6 0 0 0 7 15z" />
      <path d="M8.5 19h.01" />
      <path d="M12 19h.01" />
      <path d="M15.5 19h.01" />
      <path d="M10 21.5h.01" />
      <path d="M14 21.5h.01" />
    </>
  ),
  storm: (
    <>
      <path d="M7 14h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-.9A3.6 3.6 0 0 0 7 14z" />
      <path d="m13 16-4 3h3l-1 3 4-3h-3z" />
    </>
  ),
};

export default function WeatherGlyph({ icon, className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {GLYPHS[icon] ?? GLYPHS.cloudy}
    </svg>
  );
}
