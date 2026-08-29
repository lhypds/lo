// The pin lo marks a spot with, kept in one place because it is drawn in three:
// the button that makes a mark, the top bar link to the list of them, and the
// marker on the map itself. Three copies of a shape that has to read as the
// same object in all three places is three chances for it to stop being one.
//
// Drawn on a 24-unit grid with the point at (12, 21) and the head a circle of
// radius 7 about (12, 10). The point being 3 units up from the bottom of that
// grid is what the map has to know about: a marker anchored by its bottom edge
// would hang the pin those 3 units above the coordinate, so the map crops the
// box to the point rather than to the grid.
export const MARK_PIN_PATH = "M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z";

// The middle of that head. Everything a pin carries is centred here, so it is
// named once and read by all of them rather than written as 12 and 10 wherever
// something has to go in the right place.
const HEAD = { x: 12, y: 10 };

// The hole in the head, on the same grid.
export const MARK_PIN_EYE = { cx: HEAD.x, cy: HEAD.y, r: 2.5 };

// Where the point sits, for anyone who has to line the drawing up with a place
// in the world rather than with the middle of a button.
export const MARK_PIN_TIP_Y = 21;

// The picture in a frame the top bar wears on its way to the posts — a photo
// left on the ground, which is what a post mostly is. In parts rather than
// written out as markup because it is drawn in two places now, the button and a
// pin's head on the map, which is the arrangement this file exists to keep the
// pin above out of.
export const POST_ICON = {
  frame: { x: 3, y: 4, width: 18, height: 16 },
  sun: { cx: 8.5, cy: 9.5, r: 1.5 },
  ridge: "M21 15l-5-4-5 4-3-2-5 4",
};

// What the map puts in a pin's head to say which kind of thing is standing
// there. The plain circle above is what a pin says when the answer is "a spot
// you chose"; these are the other three answers.
//
// Each is drawn full size on the same 24-unit grid the top bar's icons are drawn
// on and then shrunk into the head by the transform beside it. Drawing them at
// icon size is what lets the post's be the bar's own picture frame rather than a
// second, smaller copy of it — and it is why the scales differ: what has to come
// out the same is how big each reads inside the head, and a frame 18 wide and a
// fork 9 wide do not get there by the same number.
const inHead = (scale) => `translate(${HEAD.x} ${HEAD.y}) scale(${scale}) translate(-12 -12)`;

// The two the ground itself put there are filled, where lo's own two are drawn
// in outline like every other icon in the app. Not a whim: two dozen of these
// land at once, at the size of a head about fifteen pixels across. A cup in
// outline at that size is four hairlines with a pixel between them, which is a
// smudge, and a fork is worse. Filled, each is a silhouette, and a reader
// glancing down a street of them can tell coffee from dinner without stopping.
export const PIN_GLYPHS = {
  // Smaller in its head than the two below are in theirs, which is the frame's
  // own doing: it is the one glyph here that is a rectangle, and a rectangle
  // fills a circle corner-first. Drawn to the same width as a cup it would have
  // its corners in the pin's outline, and a frame that close to the ring around
  // it stops reading as a picture and starts reading as a smaller ring.
  post: {
    transform: inHead(0.36),
    parts: [
      { tag: "rect", ...POST_ICON.frame },
      { tag: "circle", solid: true, ...POST_ICON.sun },
      { tag: "path", d: POST_ICON.ridge },
    ],
  },
  // A cup from the side with the handle on the right: a semicircle hung under
  // two straight walls, which is the shape a cup has where a mug has a flat
  // bottom. The handle is a half circle of its own — stroked rather than filled,
  // since a ring that size filled would close up into a blob, and fatter than
  // the hairlines everywhere else so that it carries against the solid body.
  // Both its ends stop inside that body, which is what makes it read as part of
  // the cup rather than as a loop set down beside it.
  cafe: {
    transform: inHead(0.58),
    parts: [
      { tag: "path", solid: true, d: "M5.5 6h11v6a5.5 5.5 0 0 1-11 0z" },
      { tag: "path", d: "M15.9 8.6a2.5 2.5 0 0 1 0 5", "stroke-width": 1.8 },
    ],
  },
  // Three tines, two slots and a handle, drawn as one outline so the whole fork
  // is a single filled shape. The slots are as wide as the tines — anything
  // narrower closes up at the size this is seen at — and they stop short of the
  // shoulders, which are rounded rather than cut square: a flat bar across three
  // straight tines is a Ψ, and the curve is most of what stops it reading as one.
  food: {
    transform: inHead(0.55),
    parts: [
      {
        tag: "path",
        solid: true,
        d: "M7.25 3h1.9v5.4h1.9V3h1.9v5.4h1.9V3h1.9v6a3.3 3.3 0 0 1-3.3 2.6V20h-2.9v-8.4a3.3 3.3 0 0 1-3.3-2.6z",
      },
    ],
  },
};
