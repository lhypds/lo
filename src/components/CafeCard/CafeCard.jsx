import VenuesCard from "../VenuesCard/index.js";

// Where to sit down with a coffee within a walk of here, nearest first. The
// other half of the pair — see FoodCard for why each is a card of its own and
// the panel under both of them is not.
export default function CafeCard() {
  return <VenuesCard kind="cafe" />;
}
