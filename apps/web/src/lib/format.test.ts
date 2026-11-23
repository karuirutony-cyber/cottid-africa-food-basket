import { formatDate, formatNumber } from './format';

describe('format', () => {
  it('formats numbers per locale', () => {
    expect(formatNumber(77600, 'en')).toBe('77,600');
    expect(formatNumber(77600, 'fr')).toMatch(/^77\s600$/);
    expect(formatNumber(1.5, 'pt')).toBe('1,5');
  });
  it('keeps Latin digits in Arabic', () => {
    expect(formatNumber(2024, 'ar', { useGrouping: false })).toBe('2024');
  });
  it('returns null for missing values so the UI can say "Data not available"', () => {
    expect(formatNumber(null, 'en')).toBeNull();
    expect(formatNumber(Number.NaN, 'en')).toBeNull();
    expect(formatDate('not a date', 'en')).toBeNull();
  });
  it('formats dates', () => {
    expect(formatDate('2026-11-16', 'en')).toBe('16 November 2026');
  });
});
