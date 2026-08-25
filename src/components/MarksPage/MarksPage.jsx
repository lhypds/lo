import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal, useNavigate } from "../../ui/index.js";
import Header from "../Header/index.js";
import MarkItem from "../MarkItem/index.js";
import MarkModal from "../MarkModal/index.js";
import { useHere } from "../LocationProvider/index.js";

export default function MarksPage() {
  const { t } = useTranslation();
  const { coords } = useHere();
  const navigate = useNavigate();
  const [marks, setMarks] = useState([]);
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
    <div className="page-shell">
      <Header back />
      <main className="list-page">
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
                // The map lives on the home page; a mark is shown by handing it
                // the id rather than by keeping a second map here.
                onShowOnMap={(target) => navigate(`/?focus=${target.id}`)}
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
