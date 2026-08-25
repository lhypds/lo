import { useTranslation } from "react-i18next";

export default function Loading() {
  const { t } = useTranslation();
  return <main className="center-page" aria-label={t("common.loading")} />;
}
