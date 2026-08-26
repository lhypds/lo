import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, Link, useNavigate } from "../../ui/index.js";
import { MARK_PIN_EYE, MARK_PIN_PATH } from "../../utils/icons.js";
import { useAuth } from "../AuthProvider/index.js";
import AccountModal from "../AccountModal/index.js";
import AddCard from "../AddCard/index.js";
import LanguageSwitcher from "../LanguageSwitcher/index.js";

// `cards` puts the dashboard's own contents page in the bar. On the three pages
// that are your own — the dashboard, your posts, your spots — because what the
// dashboard carries is a setting rather than a thing on the page under it, and a
// reader who has just come back from the posts list is exactly the reader who
// wants the posts panel on the grid. It costs the trip home to want it and
// another to use it if the menu is only ever at home.
//
// Not on a profile: that page is somebody else's, and a control for the shape of
// your own dashboard has no business in the bar over it.
export default function Header({ back = false, backTo = "/", cards = false }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  // The account sheet is opened from here and nowhere else, so the bar holds it
  // open itself rather than through a module anything could call.
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
          {/* First of the right-hand buttons: the only one that is about the
              dashboard rather than about somewhere else in lo — which on the two
              list pages is the page you came from and will go back to. Its list
              opens rightwards over its own row (see add.module.css). */}
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

      {/* Mounted beside the bar rather than inside it: the bar is sticky and
          carries a stacking context of its own, and a sheet opened in there would
          be pinned under it. Out here it is a child of the page, like every other
          sheet in lo. */}
      {user && <AccountModal isOpen={accountOpen} onClose={() => setAccountOpen(false)} />}
    </>
  );
}
