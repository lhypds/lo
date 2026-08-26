import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Navigate, useNavigate, useSearchParams } from "../../ui/index.js";
import { useAuth } from "../../components/AuthProvider/index.js";
import LanguageSwitcher from "../../components/LanguageSwitcher/index.js";

export default function AuthPage() {
  const { t } = useTranslation();
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState(searchParams.get("username") || "");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const name = username.trim().normalize("NFKC").toLowerCase();
    if (!name) return setError(t("auth.usernameRequired"));
    setSubmitting(true);
    setError("");
    try {
      await login(name);
      navigate("/", { replace: true });
    } catch (requestError) {
      // A name nobody has used is an account waiting to be opened — but it is
      // just as often a mistyped one, so it is offered, not assumed.
      if (requestError.code === "USER_NOT_FOUND") setPending(name);
      else setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function create() {
    if (submitting) return;
    setSubmitting(true);
    try {
      // There is no password to set, so confirming the name is the whole of
      // signing up: the account opens and this browser is already inside it.
      await register(pending);
      navigate("/", { replace: true });
    } catch (requestError) {
      setPending("");
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

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
          <p className="tagline">{t("auth.tagline")}</p>
          <form className="login-form" onSubmit={submit} autoComplete="off">
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
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submit(event);
                  }
                }}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                enterKeyHint="go"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                data-form-type="other"
                placeholder={t("auth.username")}
                maxLength={32}
              />
              <button type="submit" disabled={submitting}>
                {t("auth.login")}
              </button>
            </div>
            <p className={error ? "form-message error" : "form-message"}>{error || t("auth.usernameHint")}</p>
          </form>
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
          <button type="button" className="outline-button" onClick={() => setPending("")} disabled={submitting}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary-button" onClick={create} disabled={submitting}>
            {submitting ? t("auth.creating") : t("auth.create")}
          </button>
        </div>
      </Modal>
    </>
  );
}
