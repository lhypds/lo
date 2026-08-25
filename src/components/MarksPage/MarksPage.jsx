import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal } from "../../ui/index.js";
import Header from "../Header/index.js";
import MarkItem from "../MarkItem/index.js";
import MarkModal from "../MarkModal/index.js";
import { useHere } from "../LocationProvider/index.js";

// For the same reason the home page loads it lazily: mapbox-gl is by far the
// heaviest thing lo ships, and it is worth fetching only on the two screens
// that draw a map.
const MapCard = lazy(() => import("../MapCard/MapCard.jsx"));

// The history map lives here rather than on the dashboard: the home map answers
// "where am I", this one answers "where have I been", and the list of spots is
// the other half of that same question.
export default function MarksPage() {
  const { t } = useTranslation();
  const { coords } = useHere();
  const [marks, setMarks] = useState([]);
  const [focus, setFocus] = useState(null);
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

  useEffect(load, [load]);

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

  return (
    <div className="page-shell marks-page">
      <Header back />
      <div className="marks-map">
        <Suspense fallback={<div className="marks-map-placeholder" />}>
          <MapCard fitMarks marks={marks} focus={focus} />
        </Suspense>
      </div>
      <main className="marks-list">
        <div className="section-heading">
          <div className="section-heading-titles">
            <h1>{t("marks.title")}</h1>
            <p className="section-subtitle">{t("marks.subtitle")}</p>
          </div>
          <span>{marks.length}</span>
        </div>
        {marks.length === 0 ? (
          <p className="empty-state">{t("marks.empty")}</p>
        ) : (
          <ul className="mark-list">
            {marks.map((mark) => (
              <MarkItem
                key={mark.id}
                mark={mark}
                from={coords}
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
