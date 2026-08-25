import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { useNavigate } from "../../ui/index.js";
import { formatUsername } from "../../utils/format.js";
import { isLocationEnabled } from "../../utils/location.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
import Header from "../Header/index.js";

export default function AccountPage() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { status, disable } = useHere();
  const navigate = useNavigate();
  const [markCount, setMarkCount] = useState(null);

  useEffect(() => {
    api
      .getMe()
      .then((data) => setMarkCount(data.markCount))
      .catch(() => {});
  }, []);

  const locationOn = status === "ready" || status === "locating" || isLocationEnabled();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="page-shell">
      <Header back />
      <main className="form-page">
        <section className="account-card">
          <h1>{t("account.title")}</h1>
          <dl>
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
          {locationOn && (
            <button type="button" className="outline-button account-secondary" onClick={disable}>
              {t("account.forget")}
            </button>
          )}
          <button type="button" className="primary-button account-primary" onClick={handleLogout}>
            {t("account.logout")}
          </button>
        </section>
      </main>
    </div>
  );
}
