import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api.js";
import { Modal, Navigate, useNavigate, useSearchParams } from "../../ui/index.js";
import { rememberedUsername, useAuth } from "../../components/AuthProvider/index.js";
import LanguageSwitcher from "../../components/LanguageSwitcher/index.js";

// Where the administrator's word can be had, and the whole of what lo can do
// about a forgotten password: there is no reset link, because there is no
// address on file to send one to — an account is a name and a password and
// nothing else. Set in .env, and left out of the sheet below where it is not.
const ADMIN_EMAIL = String(import.meta.env.VITE_ADMIN_EMAIL ?? "").trim();

// What the field will take, and what the line under it says a password has to be.
// The server holds the same two numbers and is the one that enforces them (see
// usablePassword); these are here so that the screen can say so before it asks.
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 64;

// The gap between the words on the line under the field and the ways out of the
// step at the end of it, and between those two words themselves. One typographic
// space — an en, which is two of the space bar's — because each of those words is
// underlined, and a single word space between two underlined words reads as one
// underline with a nick in it rather than as two words. A character rather than a
// margin, since it is a space in a line of type; the space bar's own would not do,
// two of those being collapsed into one by the time they are drawn.
const SPACE = "\u2002";

// Signing in, in two screens. The name first, on its own, because it is the half
// that decides what the second screen is: a name nobody has used is an account
// waiting to be opened, one opened before there were passwords is a password
// waiting to be chosen, and everything else is a password to be given.
export default function AuthPage() {
  const { t } = useTranslation();
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // A link that named an account, else the last name signed in from this browser:
  // the field opens on whichever there is, and on nothing where there is neither.
  const [username, setUsername] = useState(searchParams.get("username") || rememberedUsername());
  const [password, setPassword] = useState("");
  // Which of the two screens is up, and — on the second — whether the password
  // is being asked for or being chosen, and whether the account behind it has
  // still to be opened.
  const [step, setStep] = useState("name");
  const [choosing, setChoosing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [pending, setPending] = useState("");
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  // Whatever the server said, in the reader's own language. The plain message is
  // the fallback rather than the rule: the coded answers are the ones a reader is
  // meant to act on, and those are worth saying properly.
  function nameError(requestError) {
    if (requestError.code === "USERNAME_NO_LETTER") return t("auth.usernameNoLetter");
    return requestError.message;
  }

  function passwordError(requestError) {
    if (requestError.code === "PASSWORD_WRONG") return t("auth.passwordWrong");
    if (requestError.code === "PASSWORD_INVALID") {
      return t("auth.passwordRule", { min: PASSWORD_MIN, max: PASSWORD_MAX });
    }
    return requestError.message;
  }

  async function submitName(event) {
    event.preventDefault();
    if (submitting) return;
    const name = username.trim().normalize("NFKC").toLowerCase();
    // An empty field is nothing to answer: the field says what it is for, and
    // being told to type a name into the box that says "username" is a line of
    // type in exchange for a press that plainly did nothing.
    if (!name) return;
    setSubmitting(true);
    setError("");
    try {
      const { hasPassword } = await api.checkUsername(name);
      setUsername(name);
      setChoosing(!hasPassword);
      setOpening(false);
      setStep("password");
    } catch (requestError) {
      // A name nobody has used is an account waiting to be opened — but it is
      // just as often a mistyped one, so it is offered, not assumed.
      if (requestError.code === "USER_NOT_FOUND") setPending(name);
      else setError(nameError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  // Confirming a new name does not open the account: it moves on to the screen
  // that asks for the password the account will be opened with, which is the same
  // screen everybody else is signing in through.
  function confirmNew() {
    setUsername(pending);
    setPending("");
    setChoosing(true);
    setOpening(true);
    setStep("password");
  }

  async function submitPassword(event) {
    event.preventDefault();
    if (submitting) return;
    if (!password) return setError(t("auth.passwordRequired"));
    setSubmitting(true);
    setError("");
    try {
      if (opening) await register(username, password);
      else await login(username, password);
      navigate("/", { replace: true });
    } catch (requestError) {
      // The two answers that are about the name rather than the password: it was
      // taken, or it went, between the two screens. Neither is anything the
      // password field can be used to fix, so the name comes back up.
      if (requestError.code === "USER_NOT_FOUND" || requestError.code === "USER_EXISTS") {
        back();
        setError(nameError(requestError));
      } else {
        setError(passwordError(requestError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function back() {
    setStep("name");
    setPassword("");
    setChoosing(false);
    setOpening(false);
    setError("");
  }

  const naming = step === "name";
  // What the line under the field says when there is nothing wrong: what a name
  // may be, or what a password is being asked to be. Nothing, when the password
  // asked for is one the reader already has — the field says "password", the two
  // ways out of the step are on that line, and a sentence between them saying so
  // again is a sentence nobody reads.
  const hint = naming
    ? t("auth.usernameHint")
    : choosing
      ? t("auth.passwordChooseHint", { min: PASSWORD_MIN })
      : "";
  const message = error || hint;
  // Whether the words on that line need a space before the way out of the step at
  // the end of them. A sentence brings its own separation — the stop is the space —
  // but a line like "密码错误" ends in a character that would otherwise run
  // straight into the word after it. Where there are no words there is nothing to
  // separate, and an en space is not the space bar's: it would not be dropped at
  // the start of a line, and would sit there pushing the pair off centre.
  const spaced = Boolean(message) && !/[.。!！?？]$/.test(message);

  return (
    <>
      <main className="auth-page">
        <span className="auth-lang">
          <LanguageSwitcher />
        </span>
        <section className="auth-card" aria-labelledby="login-title">
          <h1 id="login-title" className="auth-logo">
            lo
          </h1>
          {/* The same line on both screens. The second one is a step of the first
              rather than a place of its own — the wordmark and the line under it do
              not move, and what changes between them is the field. */}
          <p className="tagline">{t("auth.tagline")}</p>

          {naming ? (
            <form className="login-form" onSubmit={submitName} autoComplete="off">
              <label className="sr-only" htmlFor="lo-handle">
                {t("auth.username")}
              </label>
              <div className="joined-field">
                <input
                  id="lo-handle"
                  name="lo-handle"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitName(event);
                  }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  enterKeyHint="next"
                  data-1p-ignore
                  data-lpignore="true"
                  data-bwignore
                  data-form-type="other"
                  placeholder={t("auth.username")}
                  maxLength={32}
                />
                <button type="submit" disabled={submitting}>
                  {t("auth.next")}
                </button>
              </div>
            </form>
          ) : (
            <form className="login-form" onSubmit={submitPassword} autoComplete="off">
              <label className="sr-only" htmlFor="lo-password">
                {t("auth.password")}
              </label>
              <div className="joined-field">
                <input
                  id="lo-password"
                  name="lo-password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitPassword(event);
                  }}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  enterKeyHint="go"
                  data-1p-ignore
                  data-lpignore="true"
                  data-bwignore
                  data-form-type="other"
                  placeholder={t("auth.password")}
                  maxLength={PASSWORD_MAX}
                />
                <button type="submit" disabled={submitting}>
                  {t("auth.login")}
                </button>
              </div>
            </form>
          )}

          {/* The one line under the field, the same distance under it on both
              screens: what the field wants, or what went wrong with what it was
              given, and — on the password step — the ways out of that step at the
              end of it. They are part of the line rather than controls set beside
              it, so the way out reads as the end of what the line is saying: the
              forgotten one first and then back, one space between the two of them
              and, in front of the pair, a space only where the words did not end in
              a full stop.
              Neither is on the first screen, where the name is what back would go
              back to and a password not yet asked for is not one to have forgotten;
              nor is the forgotten one offered while a password is being chosen this
              minute, which leaves that line with back on the end of it alone. */}
          {/* One voice, whether the line is saying what the field wants or what was
              wrong with what it was given: the grey the hint is set in, and not the
              ink that marks an error everywhere else in lo (see .form-message.error).
              Nothing has gone wrong here in the sense that word usually carries —
              the line is the field talking about itself, and it is read in the same
              breath either way. */}
          <p className="form-message">
            {message}
            {!naming && spaced && SPACE}
            {!naming && !choosing && (
              <>
                <button
                  type="button"
                  className="auth-forgot"
                  onClick={() => setForgot(true)}
                  disabled={submitting}
                >
                  {t("auth.forgot")}
                </button>
                {SPACE}
              </>
            )}
            {!naming && (
              <button type="button" className="auth-back" onClick={back} disabled={submitting}>
                {t("auth.back")}
              </button>
            )}
          </p>
        </section>
      </main>

      <Modal
        isOpen={Boolean(pending)}
        title={t("auth.createTitle")}
        onClose={() => setPending("")}
        closeOnOverlay
      >
        <p className="modal-text">{t("auth.createConfirm", { name: pending })}</p>
        <div className="modal-actions">
          <button type="button" className="outline-button" onClick={() => setPending("")}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary-button" onClick={confirmNew}>
            {t("auth.create")}
          </button>
        </div>
      </Modal>

      {/* lo cannot put a password back: it is a name and a password and no address
          to send anything to, and the column holding it is plain text so that the
          one person who can read it can also set a new one. So the answer is a
          word to that person, written from the reader's own mail app with the
          account already named in it. */}
      <Modal
        isOpen={forgot}
        title={t("auth.forgotTitle")}
        onClose={() => setForgot(false)}
        closeOnOverlay
      >
        <p className="modal-text">
          {ADMIN_EMAIL ? t("auth.forgotBody", { email: ADMIN_EMAIL }) : t("auth.forgotNoAdmin")}
        </p>
        <div className="modal-actions">
          <button type="button" className="outline-button" onClick={() => setForgot(false)}>
            {t("common.cancel")}
          </button>
          {ADMIN_EMAIL && (
            <a
              className="primary-button"
              href={`mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(
                t("auth.forgotSubject", { name: username }),
              )}&body=${encodeURIComponent(t("auth.forgotMail", { name: username }))}`}
              onClick={() => setForgot(false)}
            >
              {t("auth.forgotSend")}
            </a>
          )}
        </div>
      </Modal>
    </>
  );
}
