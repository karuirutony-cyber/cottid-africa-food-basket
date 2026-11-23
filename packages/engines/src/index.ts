/**
 * Engines for the Africa Food Basket platform.
 *
 * The forecast (CottidForecast), advisory (CottidAdvisor) and landed-cost (CottidStaples) engines are
 * the legacy page's own code, extracted verbatim by tools/extract.ts and wrapped as ES modules, so every
 * figure matches the prototype exactly. They are pure functions of the datasets passed in. Typed facades
 * live next to them (*.d.ts); golden tests in engines.test.ts pin their outputs.
 */
export { default as Forecast } from './legacy/forecast.js';
export { default as Advisor } from './legacy/advisor.js';
export { default as Staples } from './legacy/staples.js';
export type { Scenario, CountrySummary, Projection, YearRow } from './legacy/forecast';
export type { AdviceNote } from './legacy/advisor';
export type { Landed, LandedLine } from './legacy/staples';
export * from './format';
export * from './trade';
export * from './types';
export const ENGINE_VERSION = 'legacy-v33';
