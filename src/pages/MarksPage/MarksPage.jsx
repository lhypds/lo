import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal } from "../../ui/index.js";
import { formatCoords } from "../../utils/format.js";
import { filterBy } from "../../utils/search.js";
import Header from "../../components/Header/index.js";
import MarkItem from "../../components/MarkItem/index.js";
import MarkModal from "../../components/MarkModal/index.js";
import SearchField from "../../components/SearchField/index.js";
import { useHere } from "../../components/LocationProvider/index.js";

// For the same reason the home page loads it lazily: mapbox-gl is by far the
// heaviest thing lo ships, and it is worth fetching only on the two screens
// that draw a map.
const MapCard = lazy(() => import("../../components/MapCard/MapCard.jsx"));

// The history map lives here rather than on the dashboard: the home map answers
// "where am I", this one answers "where have I been", and the list of spots is
// the other half of that same question.
export default function MarksPage() {
  const { t } = useTranslation();
  const { coords, reloadToken } = useHere();
  const [marks, setMarks] = useState([]);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(null);
  // The spot the pointer is resting on, whichever half of the page it is resting
  // on it: the map reports the pin, a row reports itself, and both halves are
  // told the answer. One spot, written twice — a bubble that opened over a pin
  // with the list sitting still, or a row read with nothing happening on the
  // map, left the reader to pair the two up themselves.
  const [hovered, setHovered] = useState(null);
  // And the one they have chosen, by clicking its pin or pressing its row. The
  // map holds the choice — it is the half that has a bubble open because of it —
  // and tells the page, whose only use for it is to show which row that was.
  const [chosen, setChosen] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .getMarks()
      .then((data) => setMarks(data.marks))
      .catch((requestError) => setError(requestError.message));
  }, []);

  // Again on the refresh in the top bar: the list is yours and can have grown on
  // another device since this page was opened.
  useEffect(load, [load, reloadToken]);

  async function rename(label) {
    const { mark } = await api.renameMark(renaming.id, label);
    setMarks((current) => current.map((item) => (item.id === mark.id ? mark : item)));
    setRenaming(null);
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteMark(deleting.id);
      setMarks((current) => current.filter((item) => item.id !== deleting.id));
      setDeleting(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const deletingName = deleting?.label || deleting?.place || t("marks.unnamed");

  // What each row shows is what it is searched by, the coordinates included: an
  // unnamed spot has nothing else written on it, and they are what the row is
  // wearing until somebody gives it a name.
  const shown = useMemo(
    () =>
      filterBy(marks, query, (mark) => [
        mark.label,
        mark.place,
        formatCoords(mark.latitude, mark.longitude),
      ]),
    [marks, query],
  );

  return (
    <div className="page-shell marks-page">
      <Header back />
      <div className="marks-map">
        <Suspense fallback={<div className="marks-map-placeholder" />}>
          {/* The map narrows with the list: they are two halves of one answer,
              and a search that left every pin standing would be showing spots
              the list has just said are not the ones. The fit happens once, on
              the first list that had anything in it, so typing thins the pins
              out where they stand rather than throwing the view about. */}
          <MapCard
            fitMarks
            marks={shown}
            focus={focus}
            hovered={hovered}
            onHoverPin={setHovered}
            onSelectPin={setChosen}
          />
        </Suspense>
      </div>
      <main className="marks-list">
        <div className="section-heading">
          <div className="section-heading-titles">
            <h1>{t("marks.title")}</h1>
            <p className="section-subtitle">{t("marks.subtitle")}</p>
          </div>
          {/* Both numbers while a search is running: how many answered it, out
              of how many there are to answer it. */}
          <span>{query.trim() ? `${shown.length}/${marks.length}` : marks.length}</span>
        </div>
        {/* Nothing to search until there is something to search through */}
        {marks.length > 0 && (
          <SearchField value={query} onChange={setQuery} placeholder={t("search.marks")} />
        )}
        {marks.length === 0 ? (
          <p className="empty-state">{t("marks.empty")}</p>
        ) : shown.length === 0 ? (
          <p className="empty-state">{t("search.empty", { query: query.trim() })}</p>
        ) : (
          <ul className="mark-list">
            {shown.map((mark) => (
              <MarkItem
                key={mark.id}
                mark={mark}
                from={coords}
                hovered={mark.id === hovered}
                chosen={mark.id === chosen}
                onHover={setHovered}
                onRename={setRenaming}
                onDelete={setDeleting}
                // A fresh object every time rather than the mark itself: the map
                // pans on a new `focus`, and asking twice for the same spot —
                // after wandering off it — has to move the map twice.
                onShowOnMap={(target) => setFocus({ ...target })}
              />
            ))}
          </ul>
        )}
        {error && <p className="list-error">{error}</p>}
      </main>

      <MarkModal
        isOpen={Boolean(renaming)}
        title={t("marks.renameTitle")}
        submitLabel={t("common.save")}
        initialValue={renaming?.label ?? ""}
        onClose={() => setRenaming(null)}
        onSubmit={rename}
      />

      <Modal
        isOpen={Boolean(deleting)}
        title={t("marks.deleteTitle")}
        onClose={() => setDeleting(null)}
        closeOnOverlay
      >
        <p className="modal-text">{t("marks.deleteConfirm", { name: deletingName })}</p>
        <div className="modal-actions">
          <button type="button" className="outline-button" onClick={() => setDeleting(null)} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary-button" onClick={confirmDelete} disabled={busy}>
            {busy ? t("marks.deleting") : t("marks.delete")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
