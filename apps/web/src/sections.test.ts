import { SECTIONS, sectionFor } from './sections';
import en from '@locales/en/common.json';

describe('sections', () => {
  it('has the eight public sections in order', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([
      'home',
      'countries',
      'analytics',
      'cost',
      'directory',
      'policy',
      'data',
      'about',
    ]);
  });
  it('maps paths to sections', () => {
    expect(sectionFor('/')?.id).toBe('home');
    expect(sectionFor('/countries/KE/diet')?.id).toBe('countries');
    expect(sectionFor('/compare')?.id).toBe('countries');
    expect(sectionFor('/cost/calculator')?.id).toBe('cost');
    expect(sectionFor('/about/terms')?.id).toBe('about');
    expect(sectionFor('/account')).toBeNull();
  });
  it('has an English label for every section and page', () => {
    for (const s of SECTIONS) {
      expect(en.section[s.id as keyof typeof en.section]).toBeTruthy();
      for (const p of s.pages) expect(en.page[p.key as keyof typeof en.page]).toBeTruthy();
    }
  });
});
