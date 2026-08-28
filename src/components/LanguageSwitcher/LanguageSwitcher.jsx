import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";
import { tellHost } from "../../utils/host.js";
import styles from "./lang.module.css";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "zh", label: "ZH" },
  { code: "ja", label: "JA" },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = LANGS.find((l) => l.code === i18n.language) || LANGS[0];
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, []);

  function switchLang(code) {
    i18n.changeLanguage(code);
    localStorage.setItem("lang", code);
    setOpen(false);
    // A reader who picks a language here has picked it for the glasses too. The
    // host keeps its own copy of this choice — every feed it asks for is keyed on
    // it, and the words on the display are drawn from a list of its own — and it
    // has no way of reading this one (see utils/host.js), so it is told.
    tellHost("setlang", { language: code });
  }

  return (
    <div ref={wrapperRef} className={styles.wrapper} data-open={open}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((v) => !v)}>
        {current.label}
      </button>
      <div className={styles.dropdown}>
        {LANGS.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            className={`${styles.option} ${i18n.language === code ? styles.active : ""}`}
            onClick={() => switchLang(code)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
