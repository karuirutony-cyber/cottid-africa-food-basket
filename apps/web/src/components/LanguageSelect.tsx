import { useTranslation } from 'react-i18next';
import { LANGS, type Lang } from '@afb/schema';
import { setLanguage } from '@/lib/i18n';

/** Each language is named in itself, as on the legacy page. */
const NATIVE: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
  pt: 'Português',
  ar: 'العربية',
  sw: 'Kiswahili',
};

export function LanguageSelect() {
  const { t, i18n } = useTranslation();
  return (
    <label className="flex items-center">
      <span className="sr-only">{t('a11y.language')}</span>
      <select
        className="min-h-[40px] max-w-[118px] rounded-full border border-line bg-surface px-2 text-sm font-semibold text-ink sm:max-w-none sm:px-3"
        value={i18n.language}
        onChange={(e) => void setLanguage(e.target.value as Lang)}
      >
        {LANGS.map((l) => (
          <option key={l} value={l} lang={l}>
            {NATIVE[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
