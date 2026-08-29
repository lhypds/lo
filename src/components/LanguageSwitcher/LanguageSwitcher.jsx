import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";
import { chooseLang } from "../../utils/lang.js";
import styles from "./lang.module.css";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "zh", label: "ZH" },
  { code: "ja", label: "JA" },
  { code: "fr", label: "FR" },
  { code: "es", label: "ES" },
  { code: "de", label: "DE" },
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

  // Everything a picked language means is one call, because it means the same
  // whoever picked it: the words on this page, the copy this browser keeps, the
  // glasses, and the account's own file (see utils/lang.js).
  function switchLang(code) {
    chooseLang(code);
    setOpen(false);
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
