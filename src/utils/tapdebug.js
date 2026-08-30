// A throwaway on-screen readout for working out what a host actually delivers to
// the heading (see pressDown/pressUp in ui/Card). The glasses' WebView has no
// console to open, so the events have to be shown where they can be read. On in
// the dev server only, and meant to be pulled out once the input is understood.
let node = null;
let lines = [];
let wired = false;

function enabled() {
  try {
    return import.meta.env.DEV;
  } catch {
    return false;
  }
}

export function tapLog(msg) {
  if (!enabled() || typeof document === "undefined") return;
  ensureGlobal();
  if (!node) {
    node = document.createElement("div");
    node.style.cssText =
      "position:fixed;left:4px;bottom:4px;z-index:99999;max-width:70vw;max-height:45vh;" +
      "overflow:auto;background:rgba(0,0,0,.82);color:#3f6;font:10px/1.35 monospace;" +
      "padding:4px 6px;white-space:pre;pointer-events:none;border-radius:4px;";
    document.body.appendChild(node);
  }
  const at = new Date();
  const stamp = `${String(at.getSeconds()).padStart(2, "0")}.${String(at.getMilliseconds()).padStart(3, "0")}`;
  lines.push(`${stamp} ${msg}`);
  if (lines.length > 24) lines = lines.slice(-24);
  node.textContent = lines.join("\n");
}

// Every pointer/click event the document sees, whatever its target, so an empty
// header log can be told apart from events that never arrive at all — and so the
// target each one lands on is visible when they do.
function ensureGlobal() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  const where = (e) => {
    const el = e.target;
    const tag = el?.tagName?.toLowerCase?.() || "?";
    const head = el?.closest?.("header") ? " HEAD" : "";
    return `${tag}${head}`;
  };
  for (const type of ["pointerdown", "pointerup", "click", "dblclick"]) {
    document.addEventListener(type, (e) => tapLog(`· ${type} ${e.pointerType ?? ""} @${where(e)}`), true);
  }
}
