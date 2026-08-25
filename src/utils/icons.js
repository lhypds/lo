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

// The hole in the head, on the same grid.
export const MARK_PIN_EYE = { cx: "12", cy: "10", r: "2.5" };

// Where the point sits, for anyone who has to line the drawing up with a place
// in the world rather than with the middle of a button.
export const MARK_PIN_TIP_Y = 21;
