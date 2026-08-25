import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, Link, useNavigate } from "../../ui/index.js";
import { MARK_PIN_EYE, MARK_PIN_PATH } from "../../utils/icons.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
import LanguageSwitcher from "../LanguageSwitcher/index.js";

export default function Header({ back = false, backTo = "/" }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { coords, refresh } = useHere();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  // Everything on the page, asked again. Not the position — that keeps itself
  // current on its own beat, and a button that only re-read the sensor would be
  // the one thing on the dashboard the reader never needs to press.
  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

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
          <ActionButton tooltip={t("header.refresh")} onClick={handleRefresh} disabled={refreshing}>
            <svg viewBox="0 0 24 24" className={refreshing ? "spinning" : undefined}>
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </ActionButton>
        )}
        {/* A letter rather than a drawing, because the thing it opens is drawn
            as a letter: the squares on the map say p, and so does this. */}
        {user && (
          <ActionButton tooltip={t("header.posts")} onClick={() => navigate("/posts")}>
            <span>p</span>
          </ActionButton>
        )}
        {user && (
          <ActionButton tooltip={t("header.marks")} onClick={() => navigate("/marks")}>
            <svg viewBox="0 0 24 24">
              <path d={MARK_PIN_PATH} />
              <circle {...MARK_PIN_EYE} />
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
