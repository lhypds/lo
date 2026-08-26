import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { TextArea, showToast } from "../../ui/index.js";
import { contactsFor, profileFields } from "../../utils/contacts.js";

// The same ceiling the server keeps. Long enough for a sentence about yourself
// and short enough that a profile stays a profile rather than becoming a post.
const BIO_MAX = 280;

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

  // Which of the four this reader is asked for, which is the language's answer
  // rather than the account's — see contactsFor. Read off the account as it was
  // loaded and not off the fields being typed into: a messenger that vanished the
  // moment its box was emptied would leave nowhere to press Save from.
  const asked = useMemo(() => contactsFor(i18n.language, user), [i18n.language, user]);

  // The account arrives from the session and again from /api/me a moment later,
  // so the fields are refilled when it does rather than only on first render.
  useEffect(() => {
    setFields(profileFields(user));
  }, [user]);

  function edit(field, value) {
    setFields((current) => ({ ...current, [field]: value }));
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
      <label>
        <span className="profile-label">
          {t("profile.bio")}
          <span className="profile-count">
            {fields.bio.length}/{BIO_MAX}
          </span>
        </span>
        {/* No placeholder: the label above already says what the box is for, and
            a greyed-out example sentence in it reads as something somebody wrote
            until it is looked at twice. */}
        <TextArea
          className="profile-text"
          value={fields.bio}
          onChange={(event) => edit("bio", event.target.value)}
          maxLength={BIO_MAX}
          rows={3}
          minHeight={64}
        />
      </label>

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

      {/* Set like the sheet's other controls rather than as the black bar the
          account page ended on — see account.module.css. */}
      <button type="submit" className="profile-save" disabled={saving}>
        {saving ? t("profile.saving") : t("common.save")}
      </button>
      {error && <p className="form-message error">{error}</p>}
    </form>
  );
}
