import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { AuthImage, TextArea, showToast } from "../../ui/index.js";
import { contactsFor, profileFields } from "../../utils/contacts.js";
import { compressToWebp, preload, uploadImage } from "../../utils/image.js";
import { LINK_KINDS } from "../../utils/links.js";

// The same ceilings the server keeps. The line about yourself is long enough for
// a sentence and short enough that a profile stays a profile rather than becoming
// a post; the list of other accounts is long enough that nobody sensible reaches
// the end of it.
const BIO_MAX = 280;
const LINKS_MAX = 12;

// A picture the size of the box it is shown in and no larger, and square,
// because square is the only shape a profile picture is ever drawn in — 96px on
// the profile page, 64px in this sheet, both of them cropped square by
// object-fit. So 192: twice the larger box, which is a retina screen's worth,
// and three times the smaller one.
//
// It was 320 fitted whole, which is the same number meaning something else. A
// landscape photo fitted that way stored 320x180 and drew the middle 180 of it,
// so the honest reading of the old size was 180 — and the bytes for the width
// either side were spent anyway. Cut to the square instead (see middleSquare)
// and 192 is both the number stored and the number shown: a little sharper than
// what a landscape photo used to arrive at, and between a third and two thirds
// of the pixels. This is one file every reader of the profile downloads before
// anything else on the page, so that is the trade worth making.
const AVATAR_SIZE = 192;
// And a shade under what a post photo is kept at. This one is drawn at half the
// size it is stored at, and what does not survive that reduction is not worth
// paying to send.
const AVATAR_QUALITY = 0.75;
// And the box it is drawn in here, which is also what the <img> is told it is:
// a picture whose size is on the tag does not resize the form around it when it
// arrives.
const AVATAR_BOX = 64;

// And what the bio beside it opens at, which is the whole of that column: the
// frame, the 6px of air under it, and the 22px the button to take a picture down
// stands in — 12px of word with 4px over and under it inside a hairline rule (see
// .profile-small and .profile-avatar-clear, which is where those numbers live).
//
// Held there whether or not the button is drawn. It comes and goes with the
// picture, and a bio that grew a row every time a picture arrived and lost it
// again on Remove would be the one box in this form whose height is somebody
// else's business. So the column is the taller of its two states always, and the
// bio is that height: the two boxes start on a line and end on one, and the only
// thing that moves in here is what the reader moves with the handle.
const BIO_MIN_HEIGHT = AVATAR_BOX + 6 + 22;

// The half of the account page that can be written to. The list above it is what
// lo knows about you and cannot be argued with — the name, the day you turned
// up, how many spots you have kept; this is what you say about yourself, which is
// nobody else's to fill in and yours to change whenever.
//
// Always open rather than behind an edit button: there are three short fields
// here, most of them empty on a new account, and a page whose only content is a
// form does not need a mode to say so. Save is the only gesture, and the whole
// profile goes out together — an emptied field is a contact taken down, which is
// a thing a reader must be able to do.
export default function ProfileForm({ user, onSaved }) {
  const { t, i18n } = useTranslation();
  const [fields, setFields] = useState(() => profileFields(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // What the picture looks like right now, which is not always what the account
  // says: a picture just chosen is on screen before the save that keeps it. Held
  // beside the field rather than in it because the field is the name and this is
  // the address, and the two are the same file said two ways.
  const [avatarUrl, setAvatarUrl] = useState(user.avatar ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  // Whether the reader has chosen or cleared a picture since the account last
  // arrived — see the effect below, which is what this is for.
  const touchedAvatar = useRef(false);

  // Which of the four this reader is asked for, which is the language's answer
  // rather than the account's — see contactsFor. Read off the account as it was
  // loaded and not off the fields being typed into: a messenger that vanished the
  // moment its box was emptied would leave nowhere to press Save from.
  const asked = useMemo(() => contactsFor(i18n.language, user), [i18n.language, user]);

  // The account arrives from the session and again from /api/me a moment later,
  // so the fields are refilled when it does rather than only on first render.
  //
  // The picture is the one thing here the account is not allowed to overwrite once
  // it has been touched. Everything else in this form is typed in a moment and the
  // answer to /api/me lands in the first of them; a picture is chosen, compressed
  // and uploaded, which takes seconds — and choosing one and then having the old
  // one put back by an answer to a question asked before it is the one way this
  // form could lose work.
  useEffect(() => {
    const next = profileFields(user);
    setFields((current) => (touchedAvatar.current ? { ...next, avatar: current.avatar } : next));
    if (!touchedAvatar.current) setAvatarUrl(user.avatar ?? "");
  }, [user]);

  function edit(field, value) {
    setFields((current) => ({ ...current, [field]: value }));
    setError("");
  }

  // The picture is compressed and uploaded the moment it is chosen rather than on
  // save — the same trade the post sheet makes, and for the same reason: it is by
  // far the slowest part of this, and doing it while the rest is still being typed
  // is time that was being spent anyway. What is kept in the field is the name the
  // server stored it under; the save is what attaches it to the account.
  async function pick(event) {
    const file = event.target.files?.[0];
    // The picker is reset either way, so choosing the same file twice in a row is
    // twice a change rather than once.
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { blob } = await compressToWebp(file, {
        maxSize: AVATAR_SIZE,
        square: true,
        quality: AVATAR_QUALITY,
      });
      const stored = await uploadImage(blob);
      // Held until the browser has the pixels, so the box fills with the picture
      // instead of going blank and then filling.
      await preload(stored.url);
      touchedAvatar.current = true;
      edit("avatar", stored.name);
      setAvatarUrl(stored.url);
    } catch (pickError) {
      setError(pickError.message);
    } finally {
      setUploading(false);
    }
  }

  // Taken off the account rather than off the disk: the file is content-addressed
  // and may be somebody else's picture too, so what this clears is the column.
  function clearAvatar() {
    touchedAvatar.current = true;
    edit("avatar", "");
    setAvatarUrl("");
  }

  const links = fields.links;

  function editLink(index, change) {
    setFields((current) => ({
      ...current,
      links: current.links.map((link, at) => (at === index ? { ...link, ...change } : link)),
    }));
    setError("");
  }

  // A row is added empty and filed under the first platform on the list, which is
  // the one thing a menu cannot ask before it is opened. Nothing is sent for a row
  // with no handle in it, so an added row that is never filled in costs nothing —
  // see readLinks on the server.
  function addLink() {
    setFields((current) => ({
      ...current,
      links: [...current.links, { kind: LINK_KINDS[0].kind, value: "" }],
    }));
    setError("");
  }

  function removeLink(index) {
    setFields((current) => ({ ...current, links: current.links.filter((_, at) => at !== index) }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const data = await api.updateProfile(fields);
      // Whoever owns the form decides what a save means for the frame around it
      // — the account sheet takes it as the end of the visit and closes. Which
      // is why the word comes after, from a toast that lives above the sheet
      // rather than in it: by now these fields may be off the screen, and this
      // is the only thing left that says it went through.
      // The account and the form are the same answer again, so the picture goes
      // back to following it.
      touchedAvatar.current = false;
      onSaved?.(data.user);
      showToast(t("profile.saved"), 1800);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="profile-form" onSubmit={submit} autoComplete="off">
      {/* The picture and the line about yourself, side by side, because they are
          the one thing on the profile that is read together: a face and the
          sentence under it is what a reader of /<name> is shown before anything
          else, and the form may as well be laid out the way the page it writes is.
          Each keeps its own name on a line of small grey type above it, so the two
          labels sit on one line and the two boxes start together. */}
      <div className="profile-identity">
        {/* The picture, and under it the one thing there is to do about it that
            pressing the picture cannot do — take the one there down. Choosing is
            the picture's own press, so the button that used to say so is gone: a
            frame that is pressed to fill it needs no second control saying the
            same word, and the empty frame draws a figure that reads as an
            invitation already. No drag target and no cropper either: a profile
            picture is a square shown small, and every phone and every desktop
            already has a picker that does the choosing better than a page can. */}
        <div className="profile-avatar-field">
          <span className="profile-label">{t("profile.avatar")}</span>
          {/* A button rather than a label wrapping the input, so the picture itself
              is what is pressed to change it — and so the same press works from the
              frame when there is no picture in it yet. */}
          <button
            type="button"
            className="profile-avatar"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label={t("profile.avatarPick")}
          >
            {avatarUrl ? (
              <AuthImage src={avatarUrl} alt="" width={AVATAR_BOX} height={AVATAR_BOX} />
            ) : (
              /* The same figure the top bar draws for an account, which is what an
                 empty frame here is standing in for. */
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
            )}
          </button>
          {/* The one line under the picture, which says whichever of the two
              things is true. While a file is being compressed and sent, the word
              for that — the frame is disabled and otherwise unchanged, so without
              this there is nothing on the screen saying why a press does nothing.
              Otherwise the way to take the picture down, and only where there is
              one to take: this is the one control here with nothing to do when the
              frame is empty, and a disabled button under an empty box would be a
              second way of saying it is empty. */}
          {uploading ? (
            <span className="profile-avatar-working">{t("profile.avatarWorking")}</span>
          ) : (
            avatarUrl && (
              <button
                type="button"
                className="profile-small profile-avatar-clear"
                onClick={clearAvatar}
              >
                {t("profile.avatarClear")}
              </button>
            )
          )}
          {/* Off the page and reached by the frame above it: the browser's own
              file control cannot be made to look like anything else in here. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="profile-file"
            onChange={pick}
          />
        </div>

        <label className="profile-bio-field">
          <span className="profile-label">
            {t("profile.bio")}
            <span className="profile-count">
              {fields.bio.length}/{BIO_MAX}
            </span>
          </span>
          {/* No placeholder: the label above already says what the box is for, and
              a greyed-out example sentence in it reads as something somebody wrote
              until it is looked at twice.
              Two rows and a floor, which is the house pairing (see the comment
              sheet, and TextArea itself): the rows work out shorter than the
              floor, so the floor is what the box opens at and the handle takes it
              from there. It used to ask for three, which is taller than the floor
              and made the floor a number that only the drag ever saw. */}
          <TextArea
            className="profile-text"
            value={fields.bio}
            onChange={(event) => edit("bio", event.target.value)}
            maxLength={BIO_MAX}
            rows={2}
            minHeight={BIO_MIN_HEIGHT}
          />
        </label>
      </div>

      {/* An address, and the messenger the language this is being read in
          actually uses — see utils/contacts.js. Nothing here is required: an
          account with no contact on it is an account that would rather be
          written to in lo. */}
      {asked.map((contact) => (
        <label key={contact.field}>
          <span className="profile-label">{t(contact.label)}</span>
          <input
            className="profile-input"
            type={contact.type}
            value={fields[contact.field]}
            placeholder={contact.placeholder}
            onChange={(event) => edit(contact.field, event.target.value)}
            autoComplete="off"
          />
        </label>
      ))}

      {/* And the open end of the same question: everywhere else you keep an
          account, a row at a time. The four above are asked for by name because
          lo knows which ones nearly everybody has; past those there is no list
          worth guessing at, so the reader picks the platform and lo keeps the
          handle — see utils/links.js, which is where the menu comes from.
          Empty until somebody adds a row. A form that opened with a blank row in
          it would be asking a question of every reader who has none of these,
          and most of them have none of these. */}
      <div className="profile-links">
        <span className="profile-label">{t("profile.links")}</span>
        {links.map((link, index) => (
          // Keyed by position, which is the one thing a row here has: two rows
          // can be the same platform, both can be blank while they are being
          // filled in, and nothing about a row is its identity.
          // eslint-disable-next-line react/no-array-index-key
          <div className="profile-link-row" key={index}>
            <select
              className="profile-select"
              value={link.kind}
              onChange={(event) => editLink(index, { kind: event.target.value })}
              aria-label={t("profile.linkKind")}
            >
              {/* Whatever it was saved under stays selectable even where this
                  build of lo no longer has a name for it: the alternative is a
                  menu that quietly refiles somebody's link under X. */}
              {!LINK_KINDS.some((entry) => entry.kind === link.kind) && (
                <option value={link.kind}>{link.kind}</option>
              )}
              {LINK_KINDS.map((entry) => (
                <option key={entry.kind} value={entry.kind}>
                  {entry.name}
                </option>
              ))}
            </select>
            <input
              className="profile-input"
              type="text"
              value={link.value}
              placeholder={t("profile.linkValue")}
              onChange={(event) => editLink(index, { value: event.target.value })}
              autoComplete="off"
              aria-label={t("profile.linkValue")}
            />
            <button
              type="button"
              className="profile-remove"
              onClick={() => removeLink(index)}
              aria-label={t("profile.linkRemove")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
        {/* Stops offering at the ceiling the server keeps rather than refusing at
            it: a form that lets a row be added and then loses it on save is the
            worse of the two ways to say twelve is enough. */}
        {links.length < LINKS_MAX && (
          <button type="button" className="profile-small profile-add" onClick={addLink}>
            {t("profile.linkAdd")}
          </button>
        )}
      </div>

      {/* Set like the sheet's other controls rather than as the black bar the
          account page ended on — see account.module.css. */}
      <button type="submit" className="profile-save" disabled={saving}>
        {saving ? t("profile.saving") : t("common.save")}
      </button>
      {error && <p className="form-message error">{error}</p>}
    </form>
  );
}
