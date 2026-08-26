import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal, useNavigate } from "../../ui/index.js";
import { formatUsername } from "../../utils/format.js";
import { isLocationEnabled } from "../../utils/location.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
import ProfileForm from "../ProfileForm/index.js";
import styles from "./account.module.css";

// Your own account, over whatever page you were on. It used to be a page at
// /account, which meant leaving the dashboard to read four facts and change a
// bio and then finding your way back to it — the same round trip somebody else's
// profile stopped making when it became a sheet. Nothing here is worth an address
// of its own: an account is not somewhere you go, and it is nobody's to open but
// yours, so there is nothing to link to, bookmark or send.
//
// Unlike the profile sheet this one has exactly one way in — the figure in the
// top bar, which mounts it — so it is opened by a prop rather than through a
// module of its own the way UserModal is.
//
// Laid out the way liveboard's own account sheet is: the record, then a titled
// block for each thing that can be done to it, and the way out set on its own at
// the right-hand end of the foot.
export default function AccountModal({ isOpen, onClose }) {
  const { t, i18n } = useTranslation();
  const { user, updateUser, logout } = useAuth();
  const { status } = useHere();
  const navigate = useNavigate();
  const [markCount, setMarkCount] = useState(null);

  // Asked again each time the sheet opens rather than once on mount: the top bar
  // this hangs off is on every page and never unmounts, so a count read when the
  // app started would be the number of marks you had when you signed in. It is
  // also the account as the server has it, which is what the form below must
  // open on — a profile edited on another device happened after this session.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    api
      .getMe()
      .then((data) => {
        if (cancelled) return;
        setMarkCount(data.markCount);
        updateUser(data.user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, updateUser]);

  const locationOn = status === "ready" || status === "locating" || isLocationEnabled();

  async function handleLogout() {
    await logout();
    onClose();
    navigate("/login", { replace: true });
  }

  // The moment after signing out and before the sheet is told to close, there is
  // no account to draw — and every line below is a reading of one.
  if (!user) return null;

  return (
    <Modal isOpen={isOpen} title={t("account.title")} onClose={onClose} closeOnOverlay>
      <div className={styles.account}>
        {/* What lo knows about you and cannot be argued with. Whether the app
            has your position is one of the four, read and not set: it is turned
            on by being asked for and off in the browser's own settings, which is
            the only place it can be turned off for good. */}
        <dl className={styles.facts}>
          <div>
            <dt>{t("account.username")}</dt>
            <dd>{formatUsername(user.username)}</dd>
          </div>
          <div>
            <dt>{t("account.joined")}</dt>
            <dd>{new Date(user.createdAt).toLocaleDateString(i18n.language)}</dd>
          </div>
          <div>
            <dt>{t("account.marks")}</dt>
            <dd>{markCount ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("account.location")}</dt>
            <dd>{locationOn ? t("account.locationOn") : t("account.locationOff")}</dd>
          </div>
        </dl>

        <button type="button" className={styles.logout} onClick={handleLogout}>
          {t("account.logout")}
        </button>

        {/* What you say about yourself, at the foot of what lo can say about
            you. The two are on the one sheet because they are the same account
            read twice: everything above is the record and what can be done to
            it, and this is the part of the record its owner writes — the one
            block here that is worked in rather than read, which is why it is
            the block the sheet ends on. */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("profile.title")}</h3>
          {/* A save is the end of what anyone came here to do, so the sheet goes
              with it and puts the reader back on the page underneath. What says
              it went through is the toast, which lives above the sheet rather
              than inside it and is still there once this has closed. */}
          <ProfileForm
            user={user}
            onSaved={(saved) => {
              updateUser(saved);
              onClose();
            }}
          />
        </section>
      </div>
    </Modal>
  );
}
