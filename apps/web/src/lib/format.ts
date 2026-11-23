/**
 * Locale-aware number and date formatting. Arabic uses Latin digits (nu-latn), matching the sources
 * and the legacy page, so figures can be checked against them digit for digit.
 */
const LOCALE: Record<string, string> = {
  en: 'en-GB',
  fr: 'fr-FR',
  pt: 'pt-PT',
  ar: 'ar-u-nu-latn',
  sw: 'sw-KE',
};

export const localeFor = (lang: string): string => LOCALE[lang] ?? 'en-GB';

export function formatNumber(value: number | null | undefined, lang: string, opts?: Intl.NumberFormatOptions) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat(localeFor(lang), opts).format(value);
}

export function formatDate(value: Date | string | null | undefined, lang: string, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(localeFor(lang), opts ?? { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}
