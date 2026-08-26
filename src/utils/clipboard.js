// Putting one line of text where the next app can find it. A contact on somebody
// else's profile is a handle to be typed into WeChat, an address to be pasted into
// a mail client, a page to be opened in a browser — every one of them ends up
// somewhere that is not lo, and the clipboard is the whole of the way there.
//
// Two ways to do it, because one of them is not always there. navigator.clipboard
// is what a current browser offers and it is offered only on a secure page, and lo
// is read over http on a home network about as often as over https. So the modern
// one is tried first and the old selection-and-execCommand trick — deprecated
// everywhere, working everywhere — is what answers when it is missing or refused.
//
// Returns whether the text landed, rather than throwing: the caller's whole
// response either way is a line at the bottom of the screen saying which it was.
export async function copyText(value) {
  const text = String(value ?? "");
  if (!text) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused rather than absent: a tab that is not focused, or a browser that
      // asks first and was told no. Fall through — the old way needs no
      // permission and no secure page.
    }
  }
  return legacyCopy(text);
}

// The pre-clipboard-API way: a field holding the text, selected, copied, gone.
// Nothing about it can be done without putting the text on the page first, so the
// field is put where the page is not — fixed and off the left edge rather than
// hidden, because a hidden field has nothing to select.
function legacyCopy(text) {
  const field = document.createElement("textarea");
  field.value = text;
  // Read-only so a phone keyboard does not come up over the profile on the way
  // past, and out of the reading order for anything that would announce it.
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "-10000px";
  document.body.appendChild(field);
  try {
    field.select();
    // iOS reads the range and not the selection, and a field it thinks is empty
    // is a copy that silently does nothing.
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
