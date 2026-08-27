// A photo on a post: compressed to WebP here in the browser, then uploaded to
// /api/images, which stores it under data/images and serves it back by URL.
//
// Doing the compression here rather than on the server is what keeps lo free of
// an image library — every browser that can draw the map can also encode a
// canvas to WebP — and it means the wire carries the small file, not the 8 MB
// one straight off a phone.

const ENDPOINT = "/api/images";

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

// The image as WebP: scaled whole so its longest edge is at most `maxSize`, or
// — with `square` — cropped to its middle square at `maxSize` on a side.
//
// Where the browser cannot encode WebP, toBlob silently hands back a PNG, which
// for a photo is several times the size of the thing it is standing in for; so
// JPEG is asked for instead, which keeps the resize and loses only the
// transparency. Nothing that can encode neither is a browser from this decade.
// The original file is the last answer of all, and the only one that arrives
// unshrunk.
export async function compressToWebp(file, { quality = 0.82, maxSize = 1600, square = false } = {}) {
  const image = await decode(file);
  try {
    const { sx, sy, sw, sh, width, height } = square
      ? middleSquare(image, maxSize)
      : whole(image, maxSize);

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
    return { blob: file, width: image.width, height: image.height };
  } finally {
    image.close();
  }
}

// Holds until the browser has the picture at that URL ready to paint, so an
// <img> pointed at it afterwards arrives with the photo already in it rather
// than as an empty box that fills in a moment later. A URL that will not load
// resolves too: this is only ever the wait before showing something, and a
// picture that cannot be shown is the <img>'s problem to wear, not a failure of
// the upload that has already gone through.
export async function preload(url) {
  const element = new Image();
  element.src = url;
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
// that write a picture — the post sheet, and the profile on its way into the form
// (see profileFields) — are the only ones that ever have to undo it.
export function storedName(url) {
  return url ? String(url).split("/").pop() : null;
}

// Sends the bytes as they are; the server names the file after their digest and
// hands back { name, url, bytes, type }.
export async function uploadImage(blob) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Upload failed");
  }
  return response.json();
}
