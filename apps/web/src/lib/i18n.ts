import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { LANGS, RTL_LANGS, type Lang } from '@afb/schema';
import enCommon from '@locales/en/common.json';

/** Same storage key as the legacy page, so a returning visitor keeps their language. */
const STORAGE_KEY = 'afb-lang';

// Every language except English is fetched on demand as its own small chunk.
const loaders = import.meta.glob<{ default: Record<string, unknown> }>('../../../../locales/*/common.json');

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return LANGS.includes(v as Lang) ? (v as Lang) : null;
  } catch {
    return null;
  }
}

function browserLang(): Lang {
  const prefs = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  for (const p of prefs) {
    const base = p.slice(0, 2).toLowerCase() as Lang;
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

export function isRtl(lang: string): boolean {
  return RTL_LANGS.includes(lang as Lang);
}

async function loadLanguage(lang: Lang): Promise<void> {
  if (lang === 'en' || i18n.hasResourceBundle(lang, 'common')) return;
  const loader = loaders[`../../../../locales/${lang}/common.json`];
  if (!loader) throw new Error(`No locale bundle for ${lang}`);
  const mod = await loader();
  i18n.addResourceBundle(lang, 'common', mod.default, true, true);
}

function applyDocument(lang: Lang): void {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = isRtl(lang) ? 'rtl' : 'ltr';
  if (lang === 'ar') {
    // Arabic script font, loaded only when Arabic is chosen.
    void import('@fontsource/noto-naskh-arabic/400.css');
    void import('@fontsource/noto-naskh-arabic/700.css');
  }
}

/** Switch language: loads its strings, flips direction for Arabic, and remembers the choice. */
export async function setLanguage(lang: Lang): Promise<void> {
  await loadLanguage(lang);
  await i18n.changeLanguage(lang);
  applyDocument(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage may be blocked; the choice then lasts for this visit only */
  }
}

export async function initI18n(): Promise<typeof i18n> {
  const lang = storedLang() ?? browserLang();
  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: [...LANGS],
    ns: ['common'],
    defaultNS: 'common',
    resources: { en: { common: enCommon } },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  await setLanguage(lang).catch(() => applyDocument('en'));
  return i18n;
}

export default i18n;
