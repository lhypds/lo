import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal } from "../../ui/index.js";
import { formatCoords } from "../../utils/format.js";
import { labelName, labelNames } from "../../utils/label.js";
import { filterBy } from "../../utils/search.js";
import { DEFAULT_SORT, sortRows } from "../../utils/sort.js";
import Header from "../../components/Header/index.js";
import MarkItem from "../../components/MarkItem/index.js";
import MarkModal from "../../components/MarkModal/index.js";
import SearchField from "../../components/SearchField/index.js";
import SortField from "../../components/SortField/index.js";
import { useHere } from "../../components/LocationProvider/index.js";

// For the same reason the home page loads it lazily: mapbox-gl is by far the
// heaviest thing lo ships, and it is worth fetching only on the two screens
// that draw a map.
const MapCard = lazy(() => import("../../components/MapCard/MapCard.jsx"));

// The history map lives here rather than on the dashboard: the home map answers
// "where am I", this one answers "where have I been", and the list of spots is
// the other half of that same question.
export default function MarksPage() {
  const { t, i18n } = useTranslation();
  const { coords, reloadToken } = useHere();
  const [marks, setMarks] = useState([]);
  const [query, setQuery] = useState("");
  // Newest first, which is the order the list arrives in: a history is read from
  // the end, and the spot kept an hour ago is the one being looked for.
  const [sort, setSort] = useState(DEFAULT_SORT);
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

  // What the confirmation calls the spot, which is what its row calls it: the
  // name somebody gave it, or where it is when nobody has (see MarkItem).
  const deletingName = deleting
    ? labelName(deleting, i18n.language) || formatCoords(deleting.latitude, deleting.longitude)
    : "";

  // What the name box opens on: the name in the language it is about to write
  // one in, and not the name the row is showing. A box that opened on the Chinese
  // name a Japanese reading is standing in for would have them save that Chinese
  // name into Japanese by pressing the button they came to press. An empty box on
  // a row reading 我家 is the truth about the spot — it has no Japanese name yet,
  // and this is where one is written.
  const renamingName = renaming?.label?.[i18n.language] ?? "";

  // What each row shows is what it is searched by, the coordinates included: an
  // unnamed spot has nothing else written on it, and they are what the row is
  // wearing until somebody gives it a name.
  //
  // Every name the spot has and not only the one on the row, which is the one
  // place the two part company: a spot is searched by what the reader might call
  // it, and that is not always the language they are reading in (see labelNames).
  //
  // Ordered after it is narrowed, which is the cheaper way round and the same
  // answer either way: the sort is over the rows that are left rather than over
  // all of them, and a search that has thrown most of the list away has thrown
  // away most of the work.
  const shown = useMemo(
    () =>
      sortRows(
        filterBy(marks, query, (mark) => [
          ...labelNames(mark),
          formatCoords(mark.latitude, mark.longitude),
        ]),
        sort,
        coords,
      ),
    [marks, query, sort, coords],
  );

  return (
    <div className="page-shell marks-page">
      <Header back cards />
      <div className="marks-map">
        <Suspense fallback={<div className="marks-map-placeholder" />}>
          {/* The map narrows with the list: they are two halves of one answer,
              and a search that left every pin standing would be showing spots
              the list has just said are not the ones. Typing thins the pins out
              where they stand rather than throwing the view about. */}
          {/* And it opens where the reader is standing rather than fitted over
              everything they have ever kept. A fit is drawn to the outermost
              pin, so one mark left in another city pulls the view out until the
              ground actually underfoot is a few pixels wide and the spots near
              at hand are a single smudge — a page asked to say where the reader
              is answering with a country. The history is all still drawn on it,
              and a row pressed in the list pans to its own pin, which is how a
              spot far off is meant to be reached. */}
          {/* The edit and the delete in a pin's bubble open the very sheets the
              row's own two buttons open: one name box, one confirmation, one
              place each is done, whichever half of the page it was asked for
              from. */}
          <MapCard marks={shown} focus={focus} hovered={hovered} onHoverPin={setHovered} onSelectPin={setChosen} onRenameMark={setRenaming} onDeleteMark={setDeleting} />
        </Suspense>
      </div>
      <main className="marks-list">
        {/* The heading and the search stay put while the list scrolls under them
            — the title says which list this is and the field is how it is
            narrowed, and both want to be in reach at the bottom of a long one. */}
        <div className="list-sticky">
          <div className="section-heading">
            <div className="section-heading-titles">
              <h1>{t("marks.title")}</h1>
              <p className="section-subtitle">{t("marks.subtitle")}</p>
            </div>
            {/* Both numbers while a search is running: how many answered it, out
                of how many there are to answer it. */}
            <span>{query.trim() ? `${shown.length}/${marks.length}` : marks.length}</span>
          </div>
          {/* Nothing to search or order until there is something to search
              through: one row is already in whatever order it is in. */}
          {marks.length > 0 && (
            <div className="list-tools">
              <SearchField value={query} onChange={setQuery} placeholder={t("search.marks")} />
              {/* Nearest is nearest to where the reader is standing, so the menu
                  only offers it once the browser has said where that is. */}
              <SortField value={sort} onChange={setSort} near={Boolean(coords)} />
            </div>
          )}
        </div>
        <div className="list-scroll">
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
        </div>
      </main>

      <MarkModal
        isOpen={Boolean(renaming)}
        title={t("marks.renameTitle")}
        submitLabel={t("common.save")}
        initialValue={renamingName}
        onClose={() => setRenaming(null)}
        onSubmit={rename}
      />

      <Modal isOpen={Boolean(deleting)} title={t("marks.deleteTitle")} onClose={() => setDeleting(null)} closeOnOverlay>
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
