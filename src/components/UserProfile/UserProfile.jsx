import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { AuthImage, Link, showToast, useLocation } from "../../ui/index.js";
import { reopening } from "../../utils/back.js";
import { copyText } from "../../utils/clipboard.js";
import { CONTACTS } from "../../utils/contacts.js";
import { formatCoords, formatUsername, relativeTime } from "../../utils/format.js";
import { postThumb } from "../../utils/image.js";
import { profileLinks } from "../../utils/links.js";
import { workName } from "../../utils/work.js";
import { useAuth } from "../AuthProvider/index.js";
import AccountModal from "../AccountModal/index.js";
import FollowsModal from "../FollowsModal/index.js";
import MessageModal from "../MessageModal/index.js";

// What the pictures on this page are drawn at, on the tag as well as in the
// stylesheet: one that arrives without its size resizes the page around it as it
// lands, and a profile is a column of short rows where that is the whole page
// moving.
const AVATAR_BOX = 96;
const THUMB_BOX = 64;
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
  // Whether the exchange with this person is open over the page. A profile is
  // where a conversation most often starts — you have just read who somebody is
  // and want to say something to them — so the way in is here as well as in the
  // inbox, and both open the same sheet.
  const [messaging, setMessaging] = useState(false);
  // Whether your own account sheet is open over your profile: on your own page
  // the edit button under your name is the way in to it, the same sheet the top
  // bar's figure opens.
  const [editing, setEditing] = useState(false);
  // A press is out. The button keeps its word while it is — what it says is
  // still true until the server says otherwise — and only stops being pressable,
  // which is what keeps a double press from asking the same thing twice.
  const [working, setWorking] = useState(false);
  // Which recent post has its delete revealed, on your own page. A swipe left on
  // one row uncovers it, the way a conversation is deleted from the inbox; one at
  // a time, since the same swipe that opens one puts any other away.
  const [revealedPost, setRevealedPost] = useState(null);
  const postSwipe = useRef(null);
  const postSwiped = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Cleared rather than kept while the next one is on its way: the page is
    // reached from one name and then another, and one person's bio under another
    // person's name is the one thing this must never show.
    setProfile(null);
    setPosts([]);
    setFollows(null);
    setListing(null);
    setMessaging(false);
    setEditing(false);
    setRevealedPost(null);
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

  // Coming back from a profile one of this page's own sheets led to: a name in
  // the followers or following list, or the name over the far side of the
  // exchange. After the reading above rather than before it, because that one
  // clears both of them on the way in — a page arriving on a new name puts its
  // sheets down, and this is the one arrival where one of them is being picked
  // up again (see utils/back.js).
  //
  // On the location rather than on the name: the exchange is with the person
  // whose page this is, so the name it leads to is this same page, and coming
  // back to it is a step the profile underneath does not change for.
  const location = useLocation();
  useEffect(() => {
    const sheet = reopening(["follows", "chat"]);
    if (!sheet) return;
    if (sheet.kind === "chat") setMessaging(true);
    else setListing(sheet.mode);
  }, [location]);

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
  // follower, and the languages that distinguish singular from plural receive
  // the count so i18next can choose the right word.
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

  // Swipe-to-delete on your own recent posts, the same gesture the inbox uses: a
  // left drag on a row uncovers its delete, a right one puts it away.
  function onPostSwipeStart(event, id) {
    postSwipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, post: id };
  }

  function onPostSwipeEnd(event) {
    const gesture = postSwipe.current;
    postSwipe.current = null;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dx) <= 8 || Math.abs(dx) <= Math.abs(dy)) return;
    postSwiped.current = true;
    setRevealedPost(dx < 0 ? gesture.post : null);
  }

  // A press on the row: through to the post, unless the row is a drag being
  // finished or a delete standing open — either of which the press is putting
  // away rather than following.
  function onPostClick(event) {
    if (postSwiped.current) {
      postSwiped.current = false;
      event.preventDefault();
      return;
    }
    if (revealedPost) {
      event.preventDefault();
      setRevealedPost(null);
    }
  }

  async function removePost(id) {
    setRevealedPost(null);
    try {
      await api.deletePost(id);
      setPosts((current) => current.filter((post) => post.id !== id));
    } catch (requestError) {
      showToast(requestError.message, 1800);
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
            the name reads as its caption. Where there is none the same box stands
            with a figure drawn in it, so a page about somebody with no picture up
            still opens on a face rather than straight on the name. */}
        {profile &&
          (profile.avatar ? (
            <AuthImage className={styles.avatar} src={profile.avatar} alt="" width={AVATAR_BOX} height={AVATAR_BOX} />
          ) : (
            <div className={styles.avatarEmpty} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
            </div>
          ))}
        {/* The name, and nothing beside it. The day the account was opened stood
            at the other end of this line for a while and has gone: when somebody
            signed up is a fact about lo's records rather than about them, and
            the line under the name now carries the two figures that are worth
            reading — how many people follow them, and how many they follow.

            What they do goes directly under it, close enough to be read as part
            of the same answer: a name and a trade is how a person is introduced
            on paper, and it is the one thing on this page that says what somebody
            would be about before a word of their own is read. Held in a box with
            the name so the head of the page stays three things evenly spaced
            rather than four — see .who. */}
        <div className={styles.who}>
          <h1 className={styles.name}>{name}</h1>
          {/* Whichever way it was answered: a word off the menu comes back in
              the language this page is being read in, and one written by hand
              comes back as it was written — see utils/work.js. Left out
              entirely where there is none, the same as the bio below. */}
          {profile?.work && <p className={styles.work}>{workName(profile.work, t)}</p>}
        </div>

        {/* The two things this page lets you do about a person, on the line
            directly under the name — the same pair, of equal width, so they read
            as the two halves of one answer to "what now". Reading somebody and
            writing to them: the follow first, because it is the quieter of the
            two and the one more often pressed, and saying something beside it.
            Your own page has none of this — see isSelf. */}
        {profile && follows && !isSelf && (
          <div className={styles.buttons}>
            <button type="button" className={styles.follow} onClick={toggleFollow} disabled={working}>
              {t(follows.isFollowing ? "user.unfollow" : "user.follow")}
            </button>
            <button type="button" className={styles.follow} onClick={() => setMessaging(true)}>
              {t("user.message")}
            </button>
          </div>
        )}

        {/* Your own page: the one thing to do about it is change it, so the edit
            button stands where the follow and message do on everyone else's,
            under the name and above the figures. It opens the account sheet the
            top bar's figure opens — the same one, reached from your own page. */}
        {profile && isSelf && (
          <div className={styles.buttons}>
            <button type="button" className={styles.follow} onClick={() => setEditing(true)}>
              {t("user.edit")}
            </button>
          </div>
        )}
      </div>

      {error && <p className="form-message error">{error}</p>}

      {profile && (
        <>
          {/* How many read this account and how many it reads, directly under the
              name they are about: facts about who somebody is, which is what this
              page is, and they belong with the name rather than under the posts.

              Nothing at all until the figures are in hand: they come back with
              the profile in the one request the page makes, so the row lands
              with the name it sits under rather than a moment after it. */}
          {follows && (
            <div className={styles.follows}>
              <div className={styles.figures}>
                {figure("followers")}
                {figure("following")}
              </div>
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
              {posts.map((post) => {
                // Through to the posts page with the map already on it, which is
                // where a post is read — and with the name in hand so the page
                // opens filtered to @them.
                const link = (
                  <Link
                    to={`/posts?post=${post.id}&author=${encodeURIComponent(username)}`}
                    className={styles.post}
                    onClick={isSelf ? onPostClick : undefined}
                    // Off, so a swipe on it is a swipe and not the browser
                    // dragging the link out — which also swallows the pointer
                    // stream the reveal is read from.
                    draggable={false}
                  >
                    {post.image && (
                      <AuthImage
                        className={styles.thumb}
                        src={postThumb(post)}
                        alt=""
                        width={THUMB_BOX}
                        height={THUMB_BOX}
                        draggable={false}
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
                );
                // Only your own posts can be taken down, so only they carry the
                // swipe and the delete behind it.
                if (!isSelf) return <li key={post.id}>{link}</li>;
                return (
                  <li key={post.id} className={styles.postRow}>
                    <div
                      className={revealedPost === post.id ? `${styles.postSlider} ${styles.revealed}` : styles.postSlider}
                      onPointerDown={(event) => onPostSwipeStart(event, post.id)}
                      onPointerUp={onPostSwipeEnd}
                      onPointerCancel={() => {
                        postSwipe.current = null;
                      }}
                    >
                      {link}
                    </div>
                    <button
                      type="button"
                      className={styles.postDelete}
                      onClick={() => removePost(post.id)}
                      aria-label={t("post.delete")}
                      title={t("post.delete")}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M6 7l1 13h10l1-13" />
                        <path d="M9 7V4h6v3" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* And nothing after the posts. Saying something to somebody is up
              beside the follow, under the name — a black bar down here
              repeating it would be the same action twice on one short page, and
              the button is the nearer of the two to the top anyway.

              Your own profile ends there too: this is your profile as it is
              read, not as it is written, and a way through to the form would be
              answering a question nobody standing here is asking. */}
        </>
      )}

      {/* The names behind whichever figure was pressed, over the page they were
          pressed on. Mounted whether or not either is open — the sheet draws
          nothing until it has a list to draw (see ui/Modal), and keeping it here
          is what lets the two figures be the whole of the way in. */}
      <FollowsModal
        username={username}
        mode={listing}
        back={listing ? { kind: "follows", mode: listing } : null}
        onClose={() => setListing(null)}
      />

      {/* And the exchange with whoever this page is about, over the page it was
          opened from — the same sheet the inbox opens, reached from the other
          end. Mounted only while it is up: unlike the sheet above it, this one
          fetches on the name it is given, and a name is always in hand here. */}
      {messaging && (
        <MessageModal
          username={username}
          // The name over the far side of the exchange is this page's own, so
          // pressing it lands the reader where they already are — with the sheet
          // down, which is what the press was for. The ← puts it back up.
          back={{ kind: "chat" }}
          onClose={() => setMessaging(false)}
        />
      )}

      {/* Your own account, over your own page — the same sheet the top bar's
          figure opens, reached from the edit button under your name. Only on
          your own page, and mounted only while it is up. */}
      {isSelf && <AccountModal isOpen={editing} onClose={() => setEditing(false)} />}
    </div>
  );
}
