import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../ui/index.js";
import UserProfile from "../UserProfile/index.js";
import { register } from "./userApi.js";
import styles from "./user.module.css";

// A person, over whatever page asked about them. The list of people nearby used
// to press through to the posts page with @them in the search field, which
// answered one question about a row — what have they left around here — by
// leaving the dashboard for it. This answers the whole of it and stays: who they
// are, how to reach them, what they have posted, and the one thing you can do
// about them from here.
//
// Mounted once, by the top bar, and opened through userApi from wherever a name
// is written: a row in the panel of who is nearby, or the byline in a post's
// bubble on the map — which is a name inside DOM mapbox owns, and could not be
// handed a callback even if there were somewhere to hand it from.
//
// The name inside is a link to the same profile as a page of its own, so a
// person can still be opened in a tab, kept, or sent to somebody.
export default function UserModal() {
  const { t } = useTranslation();
  const [username, setUsername] = useState(null);

  useEffect(() => register((name) => setUsername(name || null)), []);

  const close = () => setUsername(null);

  return (
    <Modal isOpen={Boolean(username)} title={t("user.title")} onClose={close} closeOnOverlay>
      {/* The same frame the account sheet keeps — see user.module.css. */}
      <div className={styles.sheet}>
        {/* Keyed on the name so the sheet is a new one for each person rather
            than the same one refilled: opening a second person while the first
            is still on screen must not leave one set of answers under another's
            name. */}
        {username && <UserProfile key={username} username={username} linkName onDone={close} />}
      </div>
    </Modal>
  );
}
