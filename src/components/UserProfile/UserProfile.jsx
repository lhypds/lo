import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Link } from "../../ui/index.js";
import { CONTACTS } from "../../utils/contacts.js";
import { formatCoords, formatUsername, relativeTime } from "../../utils/format.js";
import { useAuth } from "../AuthProvider/index.js";
import { openMessages } from "../MessagesModal/messagesApi.js";
import styles from "./user.module.css";

// Who somebody is, in the four things one account can ask about another: the
// name, the line they wrote about themselves, the ways to reach them off lo, and
// what they have been leaving on the ground. A post says where somebody was
// standing and a position says they are still out there; neither of them says
// who they are, and this is the page that does.
//
// One component behind two ways in — the sheet that opens from the list of
// people nearby, and the page a name links to — because they are the same answer
// and a copy of it would drift. What differs is only the frame around it: on the
// page the name is the heading, and in the sheet it is the way through to the
// page.
export default function UserProfile({ username, linkName = false, onDone }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Cleared rather than kept while the next one is on its way: the sheet is
    // opened on one row and then another, and one person's bio under another
    // person's name is the one thing this must never show.
    setProfile(null);
    setPosts([]);
    setError("");
    api
      .getUser(username)
      .then((data) => {
        if (cancelled) return;
        setProfile(data.user);
        setPosts(data.posts ?? []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const name = formatUsername(username);
  const mine = Boolean(user && user.username === username);

  // How to reach this person, lo's own way first. It is the one channel that is
  // always there — an account is reachable in lo by being an account — so the
  // list is never empty for somebody else, and the four that have to be filled
  // in follow it. Only the filled ones: an empty row would be lo answering "how
  // do I reach them" with a label and a blank.
  //
  // Your own profile has no lo row on it, because writing to yourself is not a
  // way of being reached; with nothing filled in either, the section goes
  // entirely — see below.
  const contacts = profile
    ? [
        ...(mine
          ? []
          : [
              {
                field: "lo",
                // The app's own name, as the top bar writes it: the other rows
                // are named after the app the handle belongs to, and so is this.
                label: "lo",
                value: t("user.message"),
                press: () => {
                  onDone?.();
                  openMessages(username);
                },
              },
            ]),
        ...CONTACTS.filter((contact) => profile[contact.field]).map((contact) => ({
          ...contact,
          label: t(contact.label),
          value: profile[contact.field],
          href: contact.link ? contact.link(profile[contact.field]) : null,
        })),
      ]
    : [];

  return (
    <div className={styles.profile}>
      <div className={styles.head}>
        {linkName ? (
          <Link className={styles.name} to={`/u/${encodeURIComponent(username)}`}>
            {name}
          </Link>
        ) : (
          <h1 className={styles.name}>{name}</h1>
        )}
        {profile && (
          <span className={styles.joined}>
            {t("user.joined", { date: new Date(profile.createdAt).toLocaleDateString(i18n.language) })}
          </span>
        )}
      </div>

      {error && <p className="form-message error">{error}</p>}

      {profile && (
        <>
          {/* A bio is optional and most are empty, so the line is left out
              rather than stood in for: there is nothing to say on somebody's
              behalf about who they are. */}
          {profile.bio && <p className={styles.bio}>{profile.bio}</p>}

          {/* Nothing at all when there is nothing to put in it, heading and all:
              a rule with "no contact details" under it is a whole section spent
              saying there is no section. It only ever happens on your own
              profile, since everybody else has the lo row above. Same reading as
              the bio — what is not there is left out. */}
          {contacts.length > 0 && (
            <>
              <h2 className={styles.sectionTitle}>{t("user.contact")}</h2>
              <dl className={styles.contacts}>
                {contacts.map((contact) => (
                  <div key={contact.field}>
                    <dt>{contact.label}</dt>
                    <dd>
                      {/* Three kinds of row, and they look alike on purpose: a
                          way through to lo's own sheet, an address something can
                          be handed to, and a handle to be read off and typed
                          into another app — see CONTACTS. */}
                      {contact.press ? (
                        <button type="button" onClick={contact.press}>
                          {contact.value}
                        </button>
                      ) : contact.href ? (
                        <a href={contact.href} rel="noreferrer">
                          {contact.value}
                        </a>
                      ) : (
                        contact.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          <h2 className={styles.sectionTitle}>{t("user.posts")}</h2>
          {posts.length === 0 ? (
            <p className={styles.empty}>{t("user.noPosts")}</p>
          ) : (
            <ul className={styles.posts}>
              {posts.map((post) => (
                <li key={post.id}>
                  {/* Through to the posts page with the map already on it, which
                      is where a post is read — the same hand-off the dashboard's
                      list of posts makes, for the same reason. */}
                  <Link to={`/posts?post=${post.id}`} className={styles.post}>
                    {post.image && (
                      <img
                        className={styles.thumb}
                        src={post.image}
                        alt=""
                        loading="lazy"
                        width="32"
                        height="32"
                      />
                    )}
                    <span className={styles.postLines}>
                      <span className={styles.postTitle}>
                        {post.body || post.place || formatCoords(post.latitude, post.longitude)}
                      </span>
                      <span className={styles.postMeta}>
                        <time dateTime={post.time}>{relativeTime(post.time, i18n.language, t)}</time>
                        {post.place && post.body && <span>{post.place}</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* And nothing after the posts. Saying something to somebody is the one
              thing lo lets you do about a person, and it is already the first
              row of Contact above — a black bar down here repeating the same
              three words would be the same action twice on one short sheet, and
              the row is the nearer of the two to the top anyway.

              Your own profile ends there too: this is your profile as it is
              read, not as it is written, and a way through to the form would be
              answering a question nobody standing here is asking. */}
        </>
      )}
    </div>
  );
}
