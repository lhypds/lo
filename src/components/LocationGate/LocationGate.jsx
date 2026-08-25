import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useHere } from "../LocationProvider/index.js";
import Header from "../Header/index.js";

// Shown until there is a position to work from. Everything else in lo answers a
// question that starts "where am I", so there is nothing useful to draw first.
export default function LocationGate() {
  const { t } = useTranslation();
  const { status, enable } = useHere();
  const [asking, setAsking] = useState(false);

  const busy = asking || status === "locating";
  const blocked = status === "denied" || status === "unsupported";

  const message = {
    denied: { title: t("gate.denied"), hint: t("gate.deniedHint") },
    unsupported: { title: t("gate.unsupported"), hint: "" },
    error: { title: t("gate.error"), hint: t("gate.errorHint") },
  }[status];

  async function ask() {
    setAsking(true);
    await enable();
    setAsking(false);
  }

  return (
    <div className="page-shell">
      <Header />
      <main className="center-page gate-page">
        <section className="gate-card">
          <h1 className="auth-logo">lo</h1>
          <p className="tagline">{t("gate.body")}</p>
          {message && (
            <p className="gate-status" role="status">
              <strong>{message.title}</strong>
              {message.hint && <span>{message.hint}</span>}
            </p>
          )}
          {status !== "unsupported" && (
            <button type="button" className="primary-button gate-button" onClick={ask} disabled={busy}>
              {busy ? t("gate.locating") : blocked ? t("common.retry") : t("gate.enable")}
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
