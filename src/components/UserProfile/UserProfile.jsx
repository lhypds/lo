import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Link, showToast } from "../../ui/index.js";
import { copyText } from "../../utils/clipboard.js";
import { CONTACTS } from "../../utils/contacts.js";
import { formatCoords, formatUsername, relativeTime } from "../../utils/format.js";
import { profileLinks } from "../../utils/links.js";

// What the pictures on this page are drawn at, on the tag as well as in the
// stylesheet: one that arrives without its size resizes the page around it as it
// lands, and a profile is a column of short rows where that is the whole page
// moving.
const AVATAR_BOX = 96;
const THUMB_BOX = 48;
import styles from "./user.module.css";

// Who somebody is, in the four things one account can ask about another: the
// name, the line they wrote about themselves, the ways to reach them off lo, and
// what they have been leaving on the ground. A post says where somebody was
// standing and a position says they are still out there; neither of them says
// who they are, and this is the page that does.
//
// One way in, at /<name>, which every name in lo links to: a row in the list
// of who is nearby, the byline in a post's bubble on the map. There was a sheet
// over the page for a while as well, and this component drew both — a person
// turned out to be one answer rather than two, and the page is the one that can
// be kept, shared, or opened in a tab.
export default function UserProfile({ username }) {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Cleared rather than kept while the next one is on its way: the page is
    // reached from one name and then another, and one person's bio under another
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

  // How to reach this person, off lo: the ones with their own field, and then
  // whatever else they have added a row for. Only the filled ones — an empty row
  // would be lo answering "how do I reach them" with a label and a blank. Nobody
  // is reachable inside lo any more, so there is nothing of lo's own at the head
  // of this list, and a profile with nothing filled in has no contacts at all —
  // see below.
  //
  // A label and a value and nothing else: a row is not addressed here, because
  // pressing one copies it rather than following it (see copy). What the reader
  // does with a contact happens in the app the contact belongs to, and getting it
  // there is the same act for all of them — a WeChat ID has never been anything
  // but text to carry across, and an address turns out to travel the same way.
  //
  // One list on the page, though they are two lists in the account: the named
  // fields are the ones lo knows nearly everybody has and the rows are everywhere
  // else, which is a distinction about what the sheet asks for and not about how
  // a reader reads the answer. The rows keep the order they were added in, under
  // the fields, because the fields are the same four on every profile and are
  // where the eye already knows to start.
  const contacts = profile
    ? [
        ...CONTACTS.filter((contact) => profile[contact.field]).map((contact) => ({
          key: contact.field,
          label: t(contact.label),
          value: profile[contact.field],
        })),
        // Named by the platform rather than by a word of lo's — see
        // utils/links.js, which also knows how to build an address for the ones
        // that have one. Nothing here asks it for that any more: what is shown is
        // what its owner wrote, and what is copied is what is shown.
        ...profileLinks(profile.links).map((link, index) => ({
          key: `link:${index}:${link.kind}`,
          label: link.name,
          value: link.value,
        })),
      ]
    : [];

  // What pressing a contact does. A line at the bottom of the screen either way:
  // a clipboard is somewhere a reader cannot see, so the only thing that tells
  // them the press worked is lo saying so — and on the pages where it cannot be
  // written to at all (see utils/clipboard.js), saying that instead of nothing.
  async function copy(value) {
    const copied = await copyText(value);
    showToast(t(copied ? "user.copied" : "user.copyFailed"), 1800);
  }

  return (
    <div className={styles.profile}>
      <div className={styles.head}>
        {/* The picture, where there is one, above the name it belongs to — the one
            thing on this page that is looked at rather than read, so it leads and
            the name reads as its caption. Nothing at all where there is none: a
            page about somebody who has not put a picture up should not carry a
            grey square saying so. That is the frame in the sheet's business, where
            the empty box is what is being offered; here it would be a hole. */}
        {profile?.avatar && (
          <img
            className={styles.avatar}
            src={profile.avatar}
            alt=""
            width={AVATAR_BOX}
            height={AVATAR_BOX}
          />
        )}
        <span className={styles.headNames}>
          <h1 className={styles.name}>{name}</h1>
          {profile && (
            <span className={styles.joined}>
              {t("user.joined", { date: new Date(profile.createdAt).toLocaleDateString(i18n.language) })}
            </span>
          )}
        </span>
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
              saying there is no section. Same reading as the bio — what is not
              there is left out. */}
          {contacts.length > 0 && (
            <>
              <h2 className={styles.sectionTitle}>{t("user.contact")}</h2>
              <dl className={styles.contacts}>
                {contacts.map((contact) => (
                  <div key={contact.key}>
                    <dt>{contact.label}</dt>
                    <dd>
                      {/* One kind of row, because there is one thing to do with
                          any of them: take it to the app it belongs to. Pressing
                          it puts it on the clipboard — the address as readily as
                          the ID, which is the half of this list no link could ever
                          reach anyway.
                          The value itself is the control, underlined the way it
                          was when some of these were links: what is pressed is the
                          text, because the text is the whole of what is taken. */}
                      <button type="button" title={t("user.copy")} onClick={() => copy(contact.value)}>
                        {contact.value}
                      </button>
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
                      list of posts makes, for the same reason.

                      And with the name in hand as well, which the dashboard has
                      no reason to send: a reader who presses a row here is on
                      somebody's page and is still reading about that somebody,
                      so the page opens with @them already in the search field
                      and the rest of the ground filtered out. It is a starting
                      point rather than a lock — the field is the reader's, and
                      clearing it widens the map back out to everyone. */}
                  <Link
                    to={`/posts?post=${post.id}&author=${encodeURIComponent(username)}`}
                    className={styles.post}
                  >
                    {post.image && (
                      <img
                        className={styles.thumb}
                        src={post.image}
                        alt=""
                        loading="lazy"
                        width={THUMB_BOX}
                        height={THUMB_BOX}
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
