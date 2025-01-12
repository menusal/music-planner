import { useTranslation } from "react-i18next";

const LanguageSelector = () => {
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="">
      <select
        className="bg-gray-800 text-white px-3 py-1 rounded-md"
        onChange={(e) => changeLanguage(e.target.value)}
        value={i18n.language}
      >
        <option value="en">{t("english")}</option>
        <option value="es">{t("spanish")}</option>
      </select>
    </div>
  );
};

export default LanguageSelector;
