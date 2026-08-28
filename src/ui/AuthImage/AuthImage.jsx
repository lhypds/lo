import { useEffect, useState } from "react";
import { authImageUrl } from "../../utils/image.js";

// An <img> for a picture that is behind the session.
//
// A tag makes its own request and there is nowhere on it to put the
// Authorization header lo is read with, so a stored picture cannot be loaded by
// pointing an ordinary <img> at it. This fetches the bytes where the header can
// be attached and hands the tag the object URL that comes back. Everything else
// is an ordinary <img>: the same attributes, the same class, the same box.
//
// The width and height the caller gives are on the element from the first frame,
// before any bytes exist, so a list does not reflow as its avatars land one by
// one. Until they land the tag carries no src at all rather than an empty one —
// an empty src is a broken picture in most browsers, and this is a picture that
// has not arrived yet.
export default function AuthImage({ src, ...props }) {
  const [resolved, setResolved] = useState("");

  useEffect(() => {
    let cancelled = false;
    setResolved("");
    if (!src) return undefined;
    authImageUrl(src).then(
      (url) => {
        if (!cancelled) setResolved(url);
      },
      () => {
        // A picture that will not load leaves the box it was given empty, which
        // is what a broken <img> would have done in its place anyway.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [src]);

  return <img {...props} src={resolved || undefined} />;
}
