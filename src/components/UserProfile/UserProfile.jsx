import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Link, showToast } from "../../ui/index.js";
import { copyText } from "../../utils/clipboard.js";
import { CONTACTS } from "../../utils/contacts.js";
import { formatCoords, formatUsername, relativeTime } from "../../utils/format.js";
import { profileLinks } from "../../utils/links.js";
import { useAuth } from "../AuthProvider/index.js";
import FollowsModal from "../FollowsModal/index.js";

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
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");
  // Who reads this account, who it reads, and whether the reader in front of it
  // is one of the first — three facts that arrive together and change together,
  // so they are held as one thing rather than as three states that could get out
  // of step with each other.
  const [follows, setFollows] = useState(null);
  // Which of the two lists is open over the page, and nothing when neither is:
  // the sheet is the figures' own, so what says it is up is which figure was
  // pressed (see FollowsModal).
  const [listing, setListing] = useState(null);
  // A press is out. The button keeps its word while it is — what it says is
  // still true until the server says otherwise — and only stops being pressable,
  // which is what keeps a double press from asking the same thing twice.
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Cleared rather than kept while the next one is on its way: the page is
    // reached from one name and then another, and one person's bio under another
    // person's name is the one thing this must never show.
    setProfile(null);
    setPosts([]);
    setFollows(null);
    setListing(null);
    setError("");
    api
      .getUser(username)
      .then((data) => {
        if (cancelled) return;
        setProfile(data.user);
        setPosts(data.posts ?? []);
        setFollows(data.follows ?? null);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const name = formatUsername(username);
  // Your own page, which is the one profile with nothing to press: following
  // yourself would put your name in your own list and add one to both of your
  // own figures, and the server refuses it too. The figures themselves stay —
  // how many people read you is a thing worth knowing about your own account,
  // and the lists behind them are the same two lists.
  const isSelf = user?.username === username;

  // Either figure, drawn the way a card draws its count: the number said plainly
  // and the word after it saying which number it is. A button, because the
  // figure is the way in to the names behind it — a count nobody can open is a
  // number lo is asking to be taken on trust.
  //
  // Pressable even at nought, and deliberately: an empty sheet saying "nobody
  // yet" is an answer, and a figure that stopped being a control at nought would
  // read as one that had failed rather than as one that means none.
  //
  // The count goes to the word as well as into the figure: one follower is a
  // follower, and English is the only one of the three languages that has an
  // opinion about it — the other two answer with the one word they have,
  // whatever number is standing in front of it.
  const figure = (mode) => (
    <button type="button" className={styles.figure} onClick={() => setListing(mode)}>
      <b>{follows[mode]}</b>
      <span>{t(`user.${mode}`, { count: follows[mode] })}</span>
    </button>
  );

  // Following and stopping are one press with two words on it: what it says is
  // what it will do, which is how every other control in lo is labelled. The
  // answer carries the figures back, so the row above it changes by one at the
  // same moment the word does — one reading of one account, rather than a button
  // that knows one thing and a count that knows another.
  async function toggleFollow() {
    if (!follows) return;
    setWorking(true);
    try {
      const data = follows.isFollowing ? await api.unfollowUser(username) : await api.followUser(username);
      setFollows(data.follows);
    } catch (requestError) {
      showToast(requestError.message, 1800);
    } finally {
      setWorking(false);
    }
  }

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
        {/* The name, and nothing beside it. The day the account was opened stood
            at the other end of this line for a while and has gone: when somebody
            signed up is a fact about lo's records rather than about them, and
            the line under the name now carries the two figures that are worth
            reading — how many people follow them, and how many they follow. */}
        <h1 className={styles.name}>{name}</h1>
      </div>

      {error && <p className="form-message error">{error}</p>}

      {profile && (
        <>
          {/* The two figures at one end of a line and the one thing to do about
              a person at the other, directly under the name they are about: how
              many read this account and how many it reads are facts about who
              somebody is, which is what this page is, and they belong with the
              name rather than under the posts.

              Nothing at all until the figures are in hand: they come back with
              the profile in the one request the page makes, so the row lands
              with the name it sits under rather than a moment after it. */}
          {follows && (
            <div className={styles.follows}>
              <div className={styles.figures}>
                {figure("followers")}
                {figure("following")}
              </div>
              {/* Your own page has the figures and no button — see isSelf. */}
              {!isSelf && (
                <button
                  type="button"
                  className={styles.follow}
                  onClick={toggleFollow}
                  disabled={working}
                >
                  {t(follows.isFollowing ? "user.unfollow" : "user.follow")}
                </button>
              )}
            </div>
          )}

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

      {/* The names behind whichever figure was pressed, over the page they were
          pressed on. Mounted whether or not either is open — the sheet draws
          nothing until it has a list to draw (see ui/Modal), and keeping it here
          is what lets the two figures be the whole of the way in. */}
      <FollowsModal username={username} mode={listing} onClose={() => setListing(null)} />
    </div>
  );
}
