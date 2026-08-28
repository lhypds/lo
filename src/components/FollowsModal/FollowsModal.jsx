import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { AuthImage, Link, Modal, Skeleton } from "../../ui/index.js";
import { formatUsername, relativeTime } from "../../utils/format.js";
import styles from "./follows.module.css";

// The names behind one of the two figures on a profile, over the page they were
// pressed on. A sheet rather than a page of its own: who follows somebody is a
// footnote to their profile — it is read while standing on it and the reader
// means to go back — and there is nothing here worth an address that /<name>
// does not already hold.
//
// One component for both lists, because they are one list asked in two
// directions: everyone who reads this account, and everyone it reads. Which of
// them is open is the whole of `mode`, and it is also what says the sheet is
// open at all — the two figures under a name are the two ways in, and there is
// no third state where a sheet is up with neither of them chosen.
//
// A row is a name and, where its owner has put one up, a picture: the rest of
// who somebody is lives on their own page, which every row is a way through to.
export default function FollowsModal({ username, mode, onClose }) {
  const { t, i18n } = useTranslation();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Asked for when the sheet opens rather than with the page under it: most
  // readings of a profile never open either list, and the figures the page
  // already carries are the whole of what it has to draw until one is pressed.
  //
  // Cleared on the way in, so a sheet opened on followers and then on following
  // never shows the first list under the second's title — the same care the
  // profile itself takes when the reader walks from one name to another.
  useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    setPeople([]);
    setLoading(true);
    setError("");
    const ask = mode === "followers" ? api.getFollowers : api.getFollowing;
    ask(username)
      .then((data) => {
        if (cancelled) return;
        setPeople(data.people ?? []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username, mode]);

  return (
    <Modal
      isOpen={Boolean(mode)}
      // The sheet's own word rather than the figure's: under a name the word is
      // the second half of "12 followers", and at the head of a sheet it is a
      // title. Two keys, because in English that is two words.
      title={t(mode === "following" ? "user.followingTitle" : "user.followersTitle")}
      onClose={onClose}
      closeOnOverlay
    >
      <div className={styles.sheet}>
        {error && <p className="form-message error">{error}</p>}

        {/* Waiting is not the same answer as none, which is the rule every list
            in lo is drawn by: "nobody yet" said while the request is still out
            would be a claim about somebody's account rather than about the
            request. */}
        {people.length === 0 ? (
          loading ? (
            <Skeleton rows={4} lines={1} label={t("common.loading")} />
          ) : (
            !error && (
              <p className={styles.empty}>
                {t(mode === "following" ? "user.noFollowing" : "user.noFollowers")}
              </p>
            )
          )
        ) : (
          <ul className={styles.list}>
            {people.map((person) => (
              <li key={person.username}>
                {/* Through to the person, which is the only thing to do with a
                    name here. The sheet goes with the press: what is on the
                    other side of it is a page, and leaving this one standing
                    over another profile would be a list about somebody who is
                    no longer underneath it. A held modifier is asking for a tab
                    and leaves the sheet up, the same way the account sheet
                    hands over its own address. */}
                <Link
                  to={`/${encodeURIComponent(person.username)}`}
                  className={styles.item}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    onClose();
                  }}
                >
                  {person.avatar && (
                    <AuthImage className={styles.avatar} src={person.avatar} alt="" width="28" height="28" />
                  )}
                  <span className={styles.who}>{formatUsername(person.username)}</span>
                  {/* When the row was made. The list is newest first, so this is
                      what says where in it the eye is — and on a list somebody
                      has been on for a year, that a name arrived this morning is
                      the one thing the name itself does not say. */}
                  <time className={styles.when} dateTime={person.time}>
                    {relativeTime(person.time, i18n.language, t)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
