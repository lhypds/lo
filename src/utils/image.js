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

// The image as WebP, scaled so its longest edge is at most `maxSize`. Falls
// back to the original file when the browser cannot encode WebP — toBlob
// silently hands back a PNG in that case, and the original is both smaller and
// truer than an unshrunk re-encode of itself.
export async function compressToWebp(file, { quality = 0.82, maxSize = 1600 } = {}) {
  const image = await decode(file);
  try {
    const longest = Math.max(image.width, image.height);
    const scale = maxSize > 0 && longest > maxSize ? maxSize / longest : 1;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("could not draw that image");
    context.drawImage(image.source, 0, 0, width, height);

    const webp = await toBlob(canvas, "image/webp", quality);
    if (webp?.type === "image/webp") return { blob: webp, width, height };
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
    throw new Error(data?.error || "上传失败");
  }
  return response.json();
}
