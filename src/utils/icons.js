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

// A part can ask to be one of the pin's own two colours rather than left as the
// line drawing it is by default: `fill: "ink"` for the dark of the outline,
// `fill: "paper"` for the light of the head. Both turn over with the pin when
// the pointer arrives, the way the plain circle in a mark's head does — see
// .pinGlyph in map.module.css, which is where the two of them are set.
//
// The fork is the one drawn in ink, and only because of what it is: three tines
// with two slots between them, in a head about fifteen pixels across. In outline
// that is six hairlines inside nine pixels, which is a smudge. As a silhouette
// it survives, and a reader glancing down a street of two dozen of these can
// tell coffee from dinner without stopping.
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
      { tag: "circle", fill: "ink", ...POST_ICON.sun },
      { tag: "path", d: POST_ICON.ridge },
    ],
  },
  // A cup from the side with the handle on the right: a semicircle hung under
  // two straight walls, which is the shape a cup has where a mug has a flat
  // bottom. Drawn in the pin's own colours — white inside a hairline, like the
  // circle in a plain pin's head — so that of the two the ground puts on the
  // map, only the one that has to be a silhouette is one.
  //
  // The handle comes first so that the body can be laid over the ends of it.
  // They stop inside the cup rather than at its wall, which is what makes the
  // loop read as growing out of the side rather than as a ring set down beside
  // it — and a white body drawn first would leave both stubs showing through.
  // That is also what the fill is for: paper here is not the same as no fill at
  // all, it is the thing doing the covering.
  cafe: {
    transform: inHead(0.58),
    parts: [
      { tag: "path", d: "M15.9 8.6a2.5 2.5 0 0 1 0 5" },
      { tag: "path", fill: "paper", d: "M5.5 6h11v6a5.5 5.5 0 0 1-11 0z" },
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
        fill: "ink",
        d: "M7.25 3h1.9v5.4h1.9V3h1.9v5.4h1.9V3h1.9v6a3.3 3.3 0 0 1-3.3 2.6V20h-2.9v-8.4a3.3 3.3 0 0 1-3.3-2.6z",
      },
    ],
  },
  // A W, for the one pin that says "read about this" rather than "eat here" or
  // "sit down here". The open book that stood here first was the honest drawing
  // of what the pin means and the wrong one for what the pin has to do: at nine
  // pixels across, a book, a wallet and a laptop are the same small hinged
  // rectangle, and a reader glancing over a street of two dozen pins was being
  // asked to identify a genre of object. A letter is not identified, it is read
  // — and this is the letter the encyclopaedia itself is known by, which turns
  // "some kind of book?" into "Wikipedia" without a stop.
  //
  // A silhouette for the fork's reason (see above): four hairline strokes inside
  // nine pixels is a smudge, and this is the one glyph here whose whole job is
  // to survive the glance. Two V's overlapping at a shared middle apex that
  // reaches the full height, which is the shape that reads as a W rather than as
  // a zigzag — sans-serif, because the serifs on Wikipedia's own mark close up
  // long before this size. Shrunk by the fork's number as well, though it is the
  // widest thing anyone has asked to put in this head: what decides how big it
  // can be is not that width but its two top corners, which are the far ends of
  // the diagonal, and it is the diagonal that has to fit the circle.
  //
  // 18 wide and 11 tall with strokes 2.1 across, which comes out at about 1.3px
  // on the pin — a shade heavier than the hairline everything else here is drawn
  // with, and no more. A silhouette does not have to be a heavy one: the letter
  // was drawn a third fatter at first and read as a blot on white and a hole on
  // black, where the counters between the strokes are the shape doing the work.
  wikipedia: {
    transform: inHead(0.55),
    parts: [
      {
        tag: "path",
        fill: "ink",
        d: "M3 6.5h2.1l3.45 6.84 3.45-6.84 3.45 6.84 3.45-6.84h2.1l-5.55 11-3.45-6.84-3.45 6.84z",
      },
    ],
  },
  // A clock face, for the pin that says "this spot, then": a ring with two
  // hands at ten past ten, which is the one time a drawn clock is known by —
  // both hands up and apart, so neither lies along the other or along the rim.
  // Two hairlines inside a ring survives the glance where a camera would not:
  // at nine pixels a camera, a house and a bag are the same small lidded box,
  // and the fork comment above already buried that genre of drawing. The ring
  // is papered for the cup's reason — of what this pin and a landmark's put on
  // one street, only the letter has to be a silhouette.
  history: {
    transform: inHead(0.58),
    parts: [
      { tag: "circle", fill: "paper", cx: "12", cy: "12", r: "8.5" },
      { tag: "path", d: "M8.6 10.1 12 12l4.8-2.7" },
    ],
  },
};
