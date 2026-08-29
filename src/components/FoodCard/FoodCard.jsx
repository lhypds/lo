import VenuesCard from "../VenuesCard/index.js";

// Where to eat within a walk of here, nearest first — restaurants, the counters
// you eat at standing up, and the food halls that are a dozen of both.
//
// A card of its own rather than a call to VenuesCard with a word in it, because
// the dashboard deals in cards: this is the thing the reader adds from the plus
// in the top bar, drags about the grid and gives a second tile to, and every one
// of those is answered by an id (see utils/cards.js). The panel it draws is
// shared with the café card next door, which is the half that is the same.
export default function FoodCard() {
  return <VenuesCard kind="food" />;
}
