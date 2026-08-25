import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, Link, useNavigate } from "../../ui/index.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
import LanguageSwitcher from "../LanguageSwitcher/index.js";

export default function Header({ back = false, backTo = "/" }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { status, coords, refresh } = useHere();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const locating = refreshing || status === "locating";

  return (
    <header className="topbar">
      <span className="topbar-brand">
        {back ? (
          <ActionButton
            tooltip={t(backTo === "/" ? "header.backHome" : "header.back")}
            onClick={() => navigate(backTo)}
          >
            <svg viewBox="0 0 24 24">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </ActionButton>
        ) : (
          <Link className="wordmark" to="/">
            lo
          </Link>
        )}
      </span>
      <span className="topbar-action-slot topbar-action-slot-right">
        {coords && (
          <ActionButton tooltip={t("header.refresh")} onClick={handleRefresh} disabled={locating}>
            <svg viewBox="0 0 24 24" className={locating ? "spinning" : undefined}>
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </ActionButton>
        )}
        {user && (
          <ActionButton tooltip={t("header.marks")} onClick={() => navigate("/marks")}>
            <svg viewBox="0 0 24 24">
              <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </ActionButton>
        )}
        {user && (
          <ActionButton tooltip={t("header.account")} onClick={() => navigate("/account")}>
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
            </svg>
          </ActionButton>
        )}
        <LanguageSwitcher />
      </span>
    </header>
  );
}
