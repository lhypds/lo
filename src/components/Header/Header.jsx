import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionButton, Link, useNavigate } from "../../ui/index.js";
import { MARK_PIN_EYE, MARK_PIN_PATH } from "../../utils/icons.js";
import { useAuth } from "../AuthProvider/index.js";
import { useHere } from "../LocationProvider/index.js";
import AccountModal from "../AccountModal/index.js";
import AddCard from "../AddCard/index.js";
import LanguageSwitcher from "../LanguageSwitcher/index.js";
import MessagesModal from "../MessagesModal/index.js";

// `cards` puts the dashboard's own contents page in the bar. On every page there
// is a dashboard to go back to, because what the dashboard carries is a setting
// rather than a thing on the page under it, and a reader who has just come back
// from the posts list is exactly the reader who wants the posts panel on the
// grid. It costs the trip home to want it and another to use it if the menu is
// only ever at home. A profile is somebody else's page and the menu is still
// about your own dashboard there, which is an argument about what the bar is
// saying rather than about what the reader can reach: the plus is the same
// control in the same corner of every bar in lo, and the reader who wants it
// wants it wherever they have got to.
//
// Not on the gate: there is no position yet, and which cards this place can be
// asked about is an answer about where you are standing.
export default function Header({ back = false, backTo = "/", cards = false }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // How much is waiting to be read, which rides in on the presence trade the
  // provider is already making every minute (see LocationProvider). The bar has
  // no loop of its own for it: a second beat asking a question the first one can
  // answer for free would be a request a minute for a number that is nearly
  // always nought.
  const { unread } = useHere();
  const navigate = useNavigate();
  // The two sheets opened from here and nowhere else, so the bar holds them open
  // itself rather than through a module anything could call.
  const [accountOpen, setAccountOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);

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
            <ActionButton tooltip={t(backTo === "/" ? "header.backHome" : "header.back")} onClick={() => navigate(backTo)}>
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
          {user && (
            <ActionButton tooltip={t("header.marks")} onClick={() => navigate("/marks")}>
              <svg viewBox="0 0 24 24">
                <path d={MARK_PIN_PATH} />
                <circle {...MARK_PIN_EYE} />
              </svg>
            </ActionButton>
          )}
          {/* A picture in a frame, for what a post mostly is — a photo left on
              the ground — and drawn like every other icon in the bar rather than
              as the letter the map's own squares carry. */}
          {user && (
            <span className="topbar-post">
              <ActionButton tooltip={t("header.posts")} onClick={() => navigate("/posts")}>
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="16" />
                  <circle cx="8.5" cy="9.5" r="1.5" />
                  <path d="M21 15l-5-4-5 4-3-2-5 4" />
                </svg>
              </ActionButton>
            </span>
          )}
          {/* What somebody said to you, rather than what somebody left on the
              ground: posts are addressed to nobody and this is addressed to you,
              so it is the one thing in the top bar that can be waiting. The dot
              says something is; how many, and from whom, is the answer inside.

              A sheet rather than a page, on the same terms as the account below
              it: reading what somebody wrote is a glance rather than somewhere
              you go, the page you were on stays underneath, and the ✕ puts you
              back exactly where you were standing. */}
          {user && (
            <span className="topbar-badge">
              <ActionButton
                tooltip={t("messages.title")}
                aria-label={unread > 0 ? t("messages.waiting", { n: unread }) : t("messages.title")}
                onClick={() => setMessagesOpen(true)}
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

      {/* Both sheets mounted beside the bar rather than inside it: the bar is
          sticky and carries a stacking context of its own, and a sheet opened in
          there would be pinned under it. Out here they are children of the page,
          like every other sheet in lo — and because the bar is on every page, so
          are they. */}
      {user && <MessagesModal isOpen={messagesOpen} onClose={() => setMessagesOpen(false)} />}
      {user && <AccountModal isOpen={accountOpen} onClose={() => setAccountOpen(false)} />}
    </>
  );
}
