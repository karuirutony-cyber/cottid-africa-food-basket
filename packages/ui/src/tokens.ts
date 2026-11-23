/** Brand tones (section 8 of the build prompt). CSS variables in apps/web mirror these. */
export const tone = {
  millet: '#FBF3E6',
  clay: '#B5542B',
  ochre: '#D99A2B',
  sisal: '#E9D3A3',
  leaf: '#3C7A3B',
  earth: '#3A2416',
  paprika: '#C22E16',
} as const;

/** Section food colours. */
export const sectionColour = {
  home: tone.clay,
  countries: '#C8321B',
  analytics: '#B07A00',
  cost: '#8A5A26',
  directory: '#17707F',
  policy: '#2E7D32',
  data: '#7A3B1D',
  about: '#B3261E',
} as const;
export type SectionId = keyof typeof sectionColour;
