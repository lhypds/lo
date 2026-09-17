import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { Modal, useNavigate } from "../../ui/index.js";
import { travelHome, travelTo } from "../../utils/location.js";
import { findPlaces } from "../../utils/places.js";
import { readCoordinates, toSpot, travelPath } from "../../utils/travel.js";
import { useHere } from "../LocationProvider/index.js";
import styles from "./travel.module.css";

// How long typing has to pause before the list is asked for again: a name typed
// at speed is one question rather than one per letter, and the list is still
// there by the time the eye goes down to it.
const SUGGEST_MS = 250;

// The list with nothing in it — one object for every time it is emptied, so that
// emptying an empty list is not a render.
const NOTHING = { query: "", places: [] };

// How tall the list may grow before it scrolls, and how near the edge of the
// window it may run. It hangs over the sheet rather than inside it (see
// travel.module.css), so the window is what it has to fit in.
const LIST_MAX = 240;
const EDGE = 8;

// Whether what is typed is enough to suggest anything for. Two letters of a Latin
// name — one is most of the atlas — but a single character of Chinese or Japanese
// is already most of a name: 京 is Kyoto, 北 is Beijing.
function worthAsking(text) {
  return text.length >= 2 || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}

// The second half of a row: what tells this Portland from the others.
function whereIs(place) {
  return [place.region, place.country].filter(Boolean).join(" · ");
}

// Somewhere else to stand. What is typed is either a spot already — two numbers,
// the way a map writes one — or the name of a place, and a name is answered as it
// is typed, in any of lo's six languages: the places it could be drop down under
// the field (see utils/places.js), and picking one goes there. Go to without
// picking goes to the
// first. Either way the press ends on /@lat,lon, the same address a pasted link
// would have opened, so a spot flown to is one that can be reloaded, sent to
// somebody, or stepped back out of.
export default function TravelModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const { traveling } = useHere();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [finding, setFinding] = useState(false);
  const [message, setMessage] = useState("");
  // The places under the field, and the text they were found for. Kept while the
  // next letter's are on their way, so the list does not blink out and back in
  // between one letter and the next.
  const [suggested, setSuggested] = useState(NOTHING);
  // Whether the list is out — put away by Escape and by closing the sheet, and
  // brought back by the next letter or an arrow key — and which of its rows the
  // arrow keys or the pointer are on, -1 for none.
  const [listing, setListing] = useState(false);
  const [active, setActive] = useState(-1);
  // Which press a lookup belongs to. A sheet closed while the name was out, or a
  // second press over the first, leaves the answer with nowhere to go.
  const runRef = useRef(0);
  const fieldRef = useRef(null);
  const listRef = useRef(null);
  // Set by the arrow keys, the one way to reach a row that is out of sight: the
  // list is scrolled to it once it has been drawn.
  const revealRef = useRef(false);

  useEffect(() => {
    const text = query.trim();
    if (!isOpen || !worthAsking(text) || readCoordinates(text)) {
      setSuggested(NOTHING);
      return undefined;
    }
    // Every letter asks again, and the question before it is nobody's any more:
    // aborted rather than left to land, where it could arrive after the answer to
    // the letter that replaced it.
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      findPlaces(text, { signal: controller.signal })
        .then((places) => {
          if (controller.signal.aborted) return;
          setSuggested(Array.isArray(places) && places.length > 0 ? { query: text, places } : NOTHING);
          setActive(-1);
        })
        .catch(() => {
          // Overtaken by the next letter, or a geocoder having a bad minute. The
          // list stands as it was, and Go to says so out loud if it comes to it.
        });
    }, SUGGEST_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen]);

  const places = listing ? suggested.places : [];
  const shown = places.length > 0;

  // The list is laid over the sheet at the field's foot rather than into it, so
  // the sheet keeps its size while it is out. A fixed box has nothing to hang
  // from, so where the field is is read off the page, and read again whenever the
  // field can have moved: the window resizing, a keyboard coming up, the sheet
  // scrolling. It opens downwards unless its rows would not fit there and there is
  // more room above — a short window, or a phone with its keyboard up.
  useLayoutEffect(() => {
    if (!shown) return undefined;
    function hang(event) {
      const field = fieldRef.current;
      const list = listRef.current;
      // The list's own scroll moves nothing it hangs from.
      if (!field || !list || event?.target === list) return;
      const box = field.getBoundingClientRect();
      const view = window.visualViewport;
      const top = view ? view.offsetTop : 0;
      const bottom = view ? Math.min(window.innerHeight, view.offsetTop + view.height) : window.innerHeight;
      const below = bottom - box.bottom - EDGE;
      const above = box.top - top - EDGE;
      const up = list.scrollHeight > below && above > below;
      list.dataset.up = String(up);
      list.style.left = `${box.left}px`;
      list.style.width = `${box.width}px`;
      list.style.top = up ? "auto" : `${box.bottom}px`;
      list.style.bottom = up ? `${window.innerHeight - box.top}px` : "auto";
      list.style.maxHeight = `${Math.max(0, Math.min(LIST_MAX, up ? above : below))}px`;
    }
    hang();
    window.addEventListener("resize", hang);
    window.visualViewport?.addEventListener("resize", hang);
    window.visualViewport?.addEventListener("scroll", hang);
    // Captured, for the sheet's own scroll, which does not bubble this far.
    document.addEventListener("scroll", hang, true);
    return () => {
      window.removeEventListener("resize", hang);
      window.visualViewport?.removeEventListener("resize", hang);
      window.visualViewport?.removeEventListener("scroll", hang);
      document.removeEventListener("scroll", hang, true);
    };
  }, [shown, suggested]);

  // A row the arrow keys have moved onto is scrolled into the list's window, only
  // as far as it takes. Not the pointer's rows: those are already in sight, and a
  // list that moved under a resting pointer would carry it onto the next row.
  useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.children[active];
    const reveal = revealRef.current;
    revealRef.current = false;
    if (!reveal || !row) return;
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    }
  }, [active, shown]);

  // Every way out comes through here — the cross, the overlay, Escape, and
  // arriving — and the sheet opens next time on an empty field: the sheet stays
  // mounted in the bar while it is shut, so what was typed would otherwise still
  // be sitting there.
  function close() {
    runRef.current += 1;
    setQuery("");
    setFinding(false);
    setMessage("");
    setListing(false);
    setActive(-1);
    onClose();
  }

  // The spot and the address as one change. Left to land on their own they are
  // two renders — the store's first, which is whatever page is open standing on
  // the new spot for a frame before the address moves — and after a lookup they
  // would land on their own, since the answer comes back outside the press that
  // asked for it.
  function arrive(spot) {
    flushSync(() => {
      travelTo(spot);
      navigate(travelPath(spot));
      close();
    });
  }

  function pick(place) {
    const spot = toSpot(place.latitude, place.longitude);
    if (spot) arrive(spot);
  }

  // Home is the root of the site, which the address alone would say (see
  // LocationProvider); the store is told in the same press for the reason above.
  function home() {
    travelHome();
    navigate("/");
    close();
  }

  async function go(event) {
    event.preventDefault();
    const text = query.trim();
    if (!text || finding) return;
    const typed = readCoordinates(text);
    if (typed) {
      arrive(typed);
      return;
    }
    // Enter on a row the arrow keys are on is that row being picked.
    const picked = shown && active >= 0 ? places[active] : null;
    if (picked) {
      pick(picked);
      return;
    }
    const run = ++runRef.current;
    setFinding(true);
    setMessage("");
    setListing(false);
    try {
      const found = await findPlaces(text);
      if (runRef.current !== run) return;
      const spot = found?.[0] ? toSpot(found[0].latitude, found[0].longitude) : null;
      if (spot) arrive(spot);
      else setMessage(t("travel.notFound", { query: text }));
    } catch {
      if (runRef.current !== run) return;
      setMessage(t("travel.failed"));
    } finally {
      if (runRef.current === run) setFinding(false);
    }
  }

  // The arrow keys walk the list and Escape puts it away. While the list is out
  // Escape is the list's, and stopped here before the sheet hears it (see Modal).
  // Enter needs nothing: it submits the form, and Go to reads which row it was on.
  function steer(event) {
    // An input method holding the keys is choosing characters, not places.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const rows = suggested.places;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && rows.length > 0) {
      event.preventDefault();
      revealRef.current = true;
      const down = event.key === "ArrowDown";
      if (!shown) {
        setListing(true);
        setActive(down ? 0 : rows.length - 1);
        return;
      }
      // Past either end is back in the field, with no row picked.
      setActive((current) => {
        if (down) return current + 1 < rows.length ? current + 1 : -1;
        return current === -1 ? rows.length - 1 : current - 1;
      });
      return;
    }
    if (event.key === "Escape" && shown) {
      event.stopPropagation();
      setListing(false);
      setActive(-1);
    }
  }

  return (
    <Modal isOpen={isOpen} title={t("travel.title")} onClose={close} closeOnOverlay>
      <form onSubmit={go} autoComplete="off">
        <label className="sr-only" htmlFor="lo-travel">
          {t("travel.placeholder")}
        </label>
        <input
          ref={fieldRef}
          id="lo-travel"
          name="lo-travel"
          className={styles.field}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls="lo-travel-places"
          aria-activedescendant={shown && active >= 0 ? `lo-travel-place-${active}` : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setMessage("");
            setListing(true);
            setActive(-1);
          }}
          onKeyDown={steer}
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          placeholder={t("travel.placeholder")}
          maxLength={200}
        />
        {shown && (
          // A press on a row keeps the field focused — the caret where it was,
          // and on a phone the keyboard still up — so the pointer's default is
          // refused on the way down and the row answers the click.
          <ul
            ref={listRef}
            id="lo-travel-places"
            role="listbox"
            className={styles.places}
            onPointerDown={(event) => event.preventDefault()}
            onMouseDown={(event) => event.preventDefault()}
            // A row the pointer only passed over is not a row picked: Enter after
            // it has gone is Go to, not wherever the pointer last happened to be.
            onMouseLeave={() => setActive(-1)}
          >
            {places.map((place, index) => (
              <li
                key={`${place.latitude},${place.longitude},${place.name}`}
                id={`lo-travel-place-${index}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? `${styles.place} ${styles.active}` : styles.place}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(place)}
              >
                <span className={styles.name}>{place.name}</span>
                {whereIs(place) && <span className={styles.where}>{whereIs(place)}</span>}
              </li>
            ))}
          </ul>
        )}
        {message && (
          <p className="form-message error" role="status">
            {message}
          </p>
        )}
        <div className="modal-actions">
          {/* The way back, offered only to a reader who has gone somewhere. The
              wordmark and the browser's own back both get there too, and neither
              says so. A plain button rather than a submit, so Enter in the field
              is still Go to. */}
          {traveling && (
            <button type="button" className="outline-button" onClick={home}>
              {t("travel.home")}
            </button>
          )}
          <button type="submit" className="primary-button" disabled={finding}>
            {finding ? t("travel.finding") : t("travel.go")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
