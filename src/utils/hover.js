// A row and its pin are the same spot written twice — once as a line of type,
// once as a mark on the ground — and hovering either one lights up the other:
// the pin opens the bubble it opens on the map, the row takes the grey wash it
// takes in the list. This is the row's half of that, and both list pages spread
// it onto their <li>.
//
// Pointer events rather than mouse ones, and only the mouse's. A tap on a
// touchscreen fires mouseenter as well, and it fires it once with nothing to
// follow: there is no leave coming, so a bubble opened by a finger brushing a
// row would sit there with no way to put it away. A device with both — a laptop
// with a touchscreen, an iPad with a trackpad — is answered a pointer at a time
// rather than being sorted into one camp on the way in.
export function hoverProps(id, onHover) {
  if (!onHover) return {};
  return {
    onPointerEnter: (event) => {
      if (event.pointerType === "mouse") onHover(id);
    },
    onPointerLeave: (event) => {
      if (event.pointerType === "mouse") onHover(null);
    },
  };
}

// What a row is wearing, on both list pages. Two states, one wash: it means the
// preview this row belongs to is up on the map, whether that is because the
// pointer is on the row, on its pin, or because the reader chose it and the
// bubble has stayed. A chosen row needs no mark of its own — being the washed
// row while the pointer is somewhere else entirely is what says it.
export function rowClass(base, hovered, chosen) {
  return hovered || chosen ? `${base} row-hovered` : base;
}
