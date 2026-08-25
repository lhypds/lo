import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal, showToast } from "../../ui/index.js";
import { fetchRoute } from "../../utils/route.js";
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
  const [route, setRoute] = useState(null);
  const [routingId, setRoutingId] = useState(null);
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

  // Routing is a toggle on the spot it points at: asking again for the one
  // already drawn takes the line off, which is the same gesture that put it
  // there and saves hunting for the × on the map.
  async function navigateTo(mark) {
    if (route?.markId === mark.id) {
      setRoute(null);
      return;
    }
    if (!coords) {
      showToast(t("mark.needsLocation"));
      return;
    }
    if (routingId) return;
    setRoutingId(mark.id);
    try {
      const found = await fetchRoute(coords, mark);
      setRoute({
        ...found,
        markId: mark.id,
        label: mark.label || mark.place || t("marks.unnamed"),
      });
    } catch {
      // Every way this fails — no token, no road between here and there, the
      // network — leaves the reader in the same place with the same next move,
      // so they all get the one sentence rather than a code from Mapbox.
      showToast(t("route.unavailable"));
    } finally {
      setRoutingId(null);
    }
  }

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
      // A line to a spot that no longer exists is left pointing at nothing
      if (route?.markId === deleting.id) setRoute(null);
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
          <MapCard
            fitMarks
            marks={marks}
            focus={focus}
            route={route}
            onClearRoute={() => setRoute(null)}
          />
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
                route={route?.markId === mark.id ? route : null}
                routing={routingId === mark.id}
                onRename={setRenaming}
                onDelete={setDeleting}
                onNavigate={navigateTo}
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
