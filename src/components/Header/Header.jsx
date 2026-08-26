import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, Link, useNavigate } from "../../ui/index.js";
import { MARK_PIN_EYE, MARK_PIN_PATH } from "../../utils/icons.js";
import { useAuth } from "../AuthProvider/index.js";
import AccountModal from "../AccountModal/index.js";
import AddCard from "../AddCard/index.js";
import LanguageSwitcher from "../LanguageSwitcher/index.js";
import UserModal from "../UserModal/index.js";

// `cards` is the dashboard asking for its own contents page in the bar. Only the
// dashboard has one: it is the only page made of cards, and a menu of them over
// the marks list would be a list of things that are somewhere else.
export default function Header({ back = false, backTo = "/", cards = false }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  // The account sheet is the one opened from here and nowhere else, so it is
  // held open by the bar rather than by a module the way the profile sheet is.
  const [accountOpen, setAccountOpen] = useState(false);

  // There is no refresh button. The dashboard keeps itself current — the fix
  // every thirty seconds, the weather and the place name behind it, who else is
  // out there every minute — and the readings that do not, the news and what is
  // on and what is being searched for, are hourly answers to a question about a
  // whole city. A button that asked them again would nearly always come back
  // with the page that is already on screen.

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
          {/* First of the right-hand buttons: the only one that is about the page
              under the bar rather than about somewhere else in lo. Its list opens
              rightwards over its own row (see add.module.css). */}
          {cards && <AddCard />}
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

      {/* Both sheets are mounted beside the bar rather than inside it: the bar is
          sticky and carries a stacking context of its own, and a sheet opened in
          there would be pinned under it. Out here they are children of the page,
          like every other sheet in lo — and because the bar is on every page, so
          are they, which is what lets a name anywhere open one. */}
      {user && <UserModal />}
      {user && <AccountModal isOpen={accountOpen} onClose={() => setAccountOpen(false)} />}
    </>
  );
}
