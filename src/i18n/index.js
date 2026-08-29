import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zh from "./zh.json";
import ja from "./ja.json";
import fr from "./fr.json";
import es from "./es.json";
import de from "./de.json";

const savedLang = localStorage.getItem("lang");
const browserLang = navigator.language.split("-")[0];
const supportedLangs = ["en", "zh", "ja", "fr", "es", "de"];
const defaultLang = supportedLangs.includes(savedLang)
  ? savedLang
  : supportedLangs.includes(browserLang)
    ? browserLang
    : "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    ja: { translation: ja },
    fr: { translation: fr },
    es: { translation: es },
    de: { translation: de },
  },
  lng: defaultLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
