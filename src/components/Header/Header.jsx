import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, Link, useNavigate } from "../../ui/index.js";
import { MARK_PIN_EYE, MARK_PIN_PATH } from "../../utils/icons.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
import AccountModal from "../AccountModal/index.js";
import LanguageSwitcher from "../LanguageSwitcher/index.js";
import MessagesModal, { openMessages } from "../MessagesModal/index.js";
import UserModal from "../UserModal/index.js";

export default function Header({ back = false, backTo = "/" }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { coords, refresh, unread } = useHere();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  // The account sheet is the only one of the three opened from here and nowhere
  // else, so it is held open by the bar rather than by a module the way the
  // messages and profile sheets are.
  const [accountOpen, setAccountOpen] = useState(false);

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
    <>
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
          {/* What somebody said to you, rather than what somebody left on the
              ground: posts are addressed to nobody and this is addressed to you,
              so it is the one thing in the top bar that can be waiting. The dot
              says something is; how much is the sheet's own answer.

              A sheet rather than a page, so reading it costs nothing: the
              dashboard is still underneath, and closing puts the reader back
              exactly where they were standing. */}
          {user && (
            <span className="topbar-badge">
              <ActionButton
                tooltip={t("messages.title")}
                aria-label={unread > 0 ? t("messages.waiting", { n: unread }) : t("messages.title")}
                onClick={() => openMessages()}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M3 6h18v12H3z" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
              </ActionButton>
              {unread > 0 && <span className="topbar-dot" aria-hidden="true" />}
            </span>
          )}
          {/* Your own account, on the same terms as everything else up here: a
              sheet over the page you were reading rather than a page you have to
              come back from. */}
          {user && (
            <ActionButton tooltip={t("header.account")} onClick={() => setAccountOpen(true)}>
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
            </ActionButton>
          )}
          <LanguageSwitcher />
        </span>
      </header>

      {/* All three sheets are mounted beside the bar rather than inside it: the
          bar is sticky and carries a stacking context of its own, and a sheet
          opened in there would be pinned under it. Out here they are children of
          the page, like every other sheet in lo — and because the bar is on
          every page, so are they, which is what lets a name anywhere open one. */}
      {user && <MessagesModal />}
      {user && <UserModal />}
      {user && <AccountModal isOpen={accountOpen} onClose={() => setAccountOpen(false)} />}
    </>
  );
}
