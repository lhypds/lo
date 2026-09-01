// A photo on a post or a mark: compressed to WebP here in the browser, then
// uploaded to /api/images, which stores it and serves it back by URL. Where it
// is stored depends on what it ends up on and is the server's business — a
// mark's stays a file in the writer's own folder so it comes out in their
// export, a post's moves into the database every account reads (see
// server/images.js).
//
// Doing the compression here rather than on the server is what keeps lo free of
// an image library — every browser that can draw the map can also encode a
// canvas to WebP — and it means the wire carries the small file, not the 8 MB
// one straight off a phone.

import { authHeaders } from "../api.js";

const ENDPOINT = "/api/images";

// A post's photo is kept twice, because the two ways it is looked at want
// opposite things. Nearly every sighting of it is small — a 44px square in a
// row, a 32px one on the dashboard tile, a 96px band across the top of a bubble
// — and there are dozens of them on screen at once, all of them wanted at once.
// The one sighting that is not small is a reader who has pressed the picture to
// see it properly, and there is exactly one of those at a time.
//
// So: the picture, capped rather than left at whatever a phone shoots, and a
// thumbnail beside it that every list draws instead. A neighbourhood of forty
// posts costs forty thumbnails rather than forty photographs, and the photograph
// is fetched when — and only when — somebody asks to look at one.
//
// The cap is on the longest edge, which is the honest way to bound a picture
// whose shape is not known: a portrait and a landscape both fit in it.
const PHOTO_MAX = 2048;
const PHOTO_QUALITY = 0.82;

// Small enough to be several times cheaper than the picture and still sharp in
// the largest box that draws one — the band across a bubble, which is under
// 200px wide and asks for twice that on a retina screen. Below the picture's
// quality as well as its size: nothing is read at 320px, so the artefacts that
// would show at 2048 have nowhere to show.
const THUMB_MAX = 320;
const THUMB_QUALITY = 0.62;

// Safari only grew createImageBitmap for blobs in 15, so an <img> decode stands
// behind it. `imageOrientation` is what keeps a phone photo upright: EXIF
// rotation is dropped the moment the pixels reach a canvas, and the fallback
// path gets it from the browser's own orientation handling for <img>.
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // falls through to the <img> path below
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("could not read that image"));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// What to take out of the picture, and how big to draw it. The whole frame,
// scaled until its longest edge fits: a photo on a post is shown at whatever
// shape it was taken in, so nothing may be cut off it.
function whole(image, maxSize) {
  const longest = Math.max(image.width, image.height);
  const scale = maxSize > 0 && longest > maxSize ? maxSize / longest : 1;
  return {
    sx: 0,
    sy: 0,
    sw: image.width,
    sh: image.height,
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  };
}

// And the other answer: the middle square of it, `size` on a side. For a picture
// that is only ever drawn in a square box — a profile picture, which every page
// showing one crops square anyway — fitting the whole frame is the wrong resize
// twice over. Everything either side of the square travels the wire to be thrown
// away by object-fit at the far end, and the edge that decides how sharp the
// result looks is the short one, which fitting the long edge does not measure at
// all: a landscape photo fitted to 320 arrives with 180 pixels on the side the
// square is cut from, having spent nearly half its bytes on width nobody sees.
// Cropping here is what makes `size` mean the thing that is drawn, so every
// pixel stored is a pixel shown and the size can then be picked honestly against
// the box.
//
// Never enlarged past what was handed over: a small picture blown up to `size`
// is a bigger file with nothing more in it.
function middleSquare(image, size) {
  const edge = Math.min(image.width, image.height);
  const side = Math.max(1, Math.min(size, edge));
  return {
    sx: Math.round((image.width - edge) / 2),
    sy: Math.round((image.height - edge) / 2),
    sw: edge,
    sh: edge,
    width: side,
    height: side,
  };
}

// One box drawn out of a picture that has already been decoded, and encoded.
//
// Where the browser cannot encode WebP, toBlob silently hands back a PNG, which
// for a photo is several times the size of the thing it is standing in for; so
// JPEG is asked for instead, which keeps the resize and loses only the
// transparency. Nothing that can encode neither is a browser from this decade —
// and one that cannot gets null here, leaving what to do about it to the caller,
// which is not the same answer for a picture as for a thumbnail of one.
async function render(image, box, quality) {
  const { sx, sy, sw, sh, width, height } = box;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("could not draw that image");
  // A phone photo arrives several times the size of anything drawn here, and
  // the default resampling over a step that big is most of what makes a shrunk
  // picture look shrunk.
  context.imageSmoothingQuality = "high";
  context.drawImage(image.source, sx, sy, sw, sh, 0, 0, width, height);

  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp?.type === "image/webp") return { blob: webp, width, height };
  const jpeg = await toBlob(canvas, "image/jpeg", quality);
  if (jpeg?.type === "image/jpeg") return { blob: jpeg, width, height };
  return null;
}

// The image as WebP: scaled whole so its longest edge is at most `maxSize`, or
// — with `square` — cropped to its middle square at `maxSize` on a side. The
// original file is the last answer of all, and the only one that arrives
// unshrunk.
export async function compressToWebp(file, { quality = PHOTO_QUALITY, maxSize = PHOTO_MAX, square = false } = {}) {
  const image = await decode(file);
  try {
    const box = square ? middleSquare(image, maxSize) : whole(image, maxSize);
    return (await render(image, box, quality)) ?? { blob: file, width: image.width, height: image.height };
  } finally {
    image.close();
  }
}

// Both halves of a post's photo out of one decode: the picture, and the
// thumbnail every list will draw in its place.
//
// One decode rather than two calls to the above, because decoding is the slow
// half of this — a 12-megapixel JPEG off a phone takes longer to unpack than
// either canvas takes to draw and encode — and the second draw is off the same
// unpacked pixels.
//
// The thumbnail is the whole frame rather than a square cut out of the middle,
// the way an avatar's is: the boxes that draw one are not all square (the band
// across a bubble is a wide one) and each of them crops with object-fit anyway.
// It comes back null where the browser could encode nothing, which is not worth
// failing a post over — every reader falls back to the picture, which is what a
// post written before there were two files does too.
export async function compressPhoto(file) {
  const image = await decode(file);
  try {
    const drawn = await render(image, whole(image, PHOTO_MAX), PHOTO_QUALITY);
    const full = drawn ?? { blob: file, width: image.width, height: image.height };
    const thumb = await render(image, whole(image, THUMB_MAX), THUMB_QUALITY);
    return { full, thumb };
  } finally {
    image.close();
  }
}

// Which of a row's two pictures a small box should draw, and the fallback that
// makes every one of them safe to call: a post left before the thumbnail existed
// has only the one file, and it is better drawn large than not at all.
//
// A post or a mark, since a spot carries its photograph under the same four
// names a post does — the two are one picture taken standing somewhere, filed
// under who it is for (see users.js).
export function postThumb(post) {
  return post?.imageThumb || post?.image || null;
}

// And the other way round, for the one place the photograph itself is looked at:
// what the viewer is handed is the picture, the thumbnail to fill the box with
// while it comes, and the shape to hold that box in (see ui/Lightbox). Null for
// a row with no photo, which is what makes it the whole of a page's answer to
// "is the viewer open". A mark is read by it as well as a post, for the reason
// given above.
//
// The thumbnail is the one field that is not filled in when it is missing. A
// post with only the one file has nothing to show early, and saying otherwise —
// naming the picture twice — would have the viewer wait the whole fetch for it
// and then announce that it had sharpened.
export function postPhoto(post) {
  if (!post?.image) return null;
  return {
    src: post.image,
    thumb: post.imageThumb || null,
    width: post.imageWidth ?? null,
    height: post.imageHeight ?? null,
  };
}

// A stored picture is behind the session, and an <img> tag cannot be given the
// Authorization header the rest of lo is read with — the tag makes its own
// request and there is nowhere to put one. So the bytes are fetched here, where
// the header can be attached, and the tag is handed an object URL instead.
//
// Memoised by URL, and the object URLs are never revoked. The names are content
// digests, so a URL fetched once can be answered from this map forever without
// going stale; and the handful of blobs one session looks at costs less than an
// avatar that blinks out and back every time a list redraws.
const objectUrls = new Map();

export function authImageUrl(url) {
  if (!url) return Promise.resolve("");
  // Anything that is not a stored picture is already something a tag can load on
  // its own: a blob: from a file just chosen, or a data: preview.
  if (!url.startsWith(ENDPOINT)) return Promise.resolve(url);

  const known = objectUrls.get(url);
  if (known) return known;

  const pending = fetch(url, { credentials: "omit", headers: authHeaders() })
    .then((response) => {
      if (!response.ok) throw new Error(`Image failed (${response.status})`);
      return response.blob();
    })
    .then((blob) => URL.createObjectURL(blob))
    .catch((error) => {
      // Dropped rather than remembered. A picture that failed because the
      // session had not arrived yet is one to ask for again, not one to hold as
      // broken for the rest of the page's life.
      objectUrls.delete(url);
      throw error;
    });
  objectUrls.set(url, pending);
  return pending;
}

// Holds until the browser has the picture at that URL ready to paint, so an
// <img> pointed at it afterwards arrives with the photo already in it rather
// than as an empty box that fills in a moment later. A URL that will not load
// resolves too: this is only ever the wait before showing something, and a
// picture that cannot be shown is the <img>'s problem to wear, not a failure of
// the upload that has already gone through.
export async function preload(url) {
  const src = await authImageUrl(url).catch(() => "");
  if (!src) return;
  const element = new Image();
  element.src = src;
  try {
    // decode() waits for the pixels, not just the bytes — the difference is a
    // frame of blank on a large photo.
    if (typeof element.decode === "function") return await element.decode();
  } catch {
    // falls through: complete is already true either way
  }
  if (element.complete) return;
  await new Promise((resolve) => {
    element.onload = resolve;
    element.onerror = resolve;
  });
}

// A stored picture comes back on a post or a profile as the URL that serves it,
// and what writing one takes is the bare name — the file is content-addressed, so
// the last segment is it. Undone here rather than carried as a second field on
// every row: the shape of that URL is one line of SQL away, and the two things
// that write a picture — the compose sheet, which writes marks and posts alike,
// and the profile on its way into the form (see profileFields) — are the only
// ones that ever have to undo it.
export function storedName(url) {
  return url ? String(url).split("/").pop() : null;
}

// Sends the bytes as they are; the server names the file after their digest and
// hands back { name, url, bytes, type }.
export async function uploadImage(blob) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": blob.type || "application/octet-stream", ...authHeaders() },
    body: blob,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Upload failed");
  }
  return response.json();
}
