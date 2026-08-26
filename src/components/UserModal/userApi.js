// Opening somebody's profile from wherever their name turns up: a row in the
// list of people nearby, the byline in a post's bubble on the map. The same
// shape as the messages sheet's own api, and mounted the same way — once, by the
// top bar — because a name can be pressed from inside DOM that mapbox owns,
// where there is no React tree to hand a callback down through.
let _open = null;

export const openProfile = (username) => _open?.(username);

export function register(openFn) {
  _open = openFn;
  return () => {
    _open = null;
  };
}
