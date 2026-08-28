import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Link, Modal, useNavigate } from "../../ui/index.js";
import { formatUsername } from "../../utils/format.js";
import { useAuth } from "../AuthProvider/index.js";
import ProfileForm from "../ProfileForm/index.js";
import styles from "./account.module.css";

// Your own account, over whatever page you were on. It used to be a page at
// /account, which meant leaving the dashboard to read four facts and change a bio
// and then finding your way back to it. Nothing here is worth an address of its
// own: an account is not somewhere you go, and it is nobody's to open but yours,
// so there is nothing to link to, bookmark or send.
//
// What is written in the block at the foot of it does have an address, and that
// one is carried here — /<name>, the page everybody else reads. Not the same
// claim: the account is the reading and the controls, the profile is the part of
// it that faces out.
//
// It has exactly one way in — the figure in the top bar, which mounts it — so it
// is opened by a prop rather than through a module anything could call.
//
// Laid out the way liveboard's own account sheet is: the record, then a titled
// block for each thing that can be done to it, and the way out set on its own at
// the right-hand end of the foot.
export default function AccountModal({ isOpen, onClose }) {
  const { t, i18n } = useTranslation();
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [markCount, setMarkCount] = useState(null);
  const [postCount, setPostCount] = useState(null);
  // Held here as well as on the account, so the line answers the press rather
  // than the round trip: the switch is the reader's own and there is nothing for
  // them to be told about it that they did not just say. Null until the sheet
  // has read the account, which is what keeps it from drawing "on" at a reader
  // who is hidden.
  const [discoverable, setDiscoverable] = useState(null);
  const [saving, setSaving] = useState(false);

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
        setPostCount(data.postCount);
        setDiscoverable(data.user.discoverable !== false);
        updateUser(data.user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, updateUser]);

  // Straight to the new answer and back if lo will not have it. A switch that
  // waited on the round trip would sit on the old word for as long as the
  // network took, which on the one control here whose whole point is "not right
  // now" is the wrong way round.
  async function toggleDiscoverable() {
    if (discoverable === null || saving) return;
    const wanted = !discoverable;
    setDiscoverable(wanted);
    setSaving(true);
    try {
      const answer = await api.setDiscoverable(wanted);
      setDiscoverable(answer.discoverable);
    } catch {
      setDiscoverable(!wanted);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    onClose();
    navigate("/login", { replace: true });
  }

  // The moment after signing out and before the sheet is told to close, there is
  // no account to draw — and every line below is a reading of one.
  if (!user) return null;

  // The wider of the two frames the house Modal offers, which this sheet earns at
  // its foot: the block the account ends on is a profile being written — a display
  // name, a photo and a bio — and that is the same work the composer is given the
  // room for. The record above it reads no worse for the width, being a pair of
  // columns and a set of rules that simply run further.
  return (
    <Modal isOpen={isOpen} title={t("account.title")} onClose={onClose} closeOnOverlay wide>
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
            <dt>{t("account.posts")}</dt>
            <dd>{postCount ?? "—"}</dd>
          </div>
          {/* The one line of the record that can be argued with. Where lo has
              your position was read and never set — it is turned on by being
              asked for and off in the browser's own settings, which is the only
              place it can be turned off for good — so the line said nothing the
              reader could act on and is now the one that can: whether they are a
              dot on everybody else's map.

              The state is the reading and the way to change it is in brackets
              after it, which is the shape lo uses wherever a fact has a verb
              attached (see the mark line in MarkButton). Not a checkbox: the
              answer is a word either way, and a word that changes reads better
              in this column of words than a box that has to be looked at to be
              read. */}
          <div>
            <dt>{t("account.discoverable")}</dt>
            <dd>
              {discoverable === null
                ? "—"
                : discoverable
                  ? t("account.discoverableOn")
                  : t("account.discoverableOff")}
              {discoverable !== null && (
                <>
                  {" ("}
                  <button
                    type="button"
                    className={styles.action}
                    onClick={toggleDiscoverable}
                    disabled={saving}
                  >
                    {discoverable ? t("account.hideMe") : t("account.showMe")}
                  </button>
                  {")"}
                </>
              )}
            </dd>
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
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>{t("profile.title")}</h3>
            {/* Where everything under this is read: your own page, at the address
                anybody else reaches you at. The account has no address of its own
                and this is not one — it is the profile's, which is the half of the
                account that is written to be read, and knowing what it looks like
                from the outside is most of what "profile" means.
                Shown as the path rather than as a word, because the path is the
                answer: this is what a name in lo links to and what goes in a
                message to somebody. The sheet closes behind a plain press, since
                what is on the other side is the page it would otherwise be
                covering; a held modifier is asking for a tab and leaves it up. */}
            <Link
              className={styles.address}
              to={`/${encodeURIComponent(user.username)}`}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                onClose();
              }}
            >
              /{user.username}
            </Link>
          </div>
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
