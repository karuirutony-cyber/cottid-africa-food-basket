/**
 * Number formats used by the legacy page, ported character for character so every figure reads the
 * same as on the prototype (parity). All return 'n/a' or '–' for missing values, as the legacy page did.
 */
type N = number | null | undefined;
const ok = (v: N): v is number => v != null && Number.isFinite(v);

/** Thousand tonnes: "1.23 Mt", "456 kt", "7.5 kt". */
export const kt = (v: N) =>
  !ok(v)
    ? 'n/a'
    : Math.abs(v) >= 1000
      ? (v / 1000).toFixed(Math.abs(v) >= 10000 ? 1 : 2) + ' Mt'
      : (Math.abs(v) >= 10 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1)) + ' kt';

/** US$ million: "US$2.44bn", "US$505m". */
export const usdm = (v: N) =>
  !ok(v)
    ? 'n/a'
    : Math.abs(v) >= 1000
      ? 'US$' + (v / 1000).toFixed(2) + 'bn'
      : 'US$' + (Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)) + 'm';

/** Trade values in US$ million, as on the food trade tab: "US$77.6 bn", "US$505 m", "US$12 k". */
export const usd = (v: N) =>
  !ok(v)
    ? '–'
    : v < 0.095
      ? 'US$' + Math.max(1, Math.round(v * 1000)) + ' k'
      : v >= 1000
        ? 'US$' + (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' bn'
        : 'US$' + (v >= 10 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1)) + ' m';

/** Share as a percentage: 0.813 -> "81%". */
export const pc = (v: N, d = 1) => (!ok(v) ? 'n/a' : (v * 100).toFixed(d) + '%');

/** Signed change: 0.04 -> "+4.0%". */
export const sg = (v: N, d = 1) => (!ok(v) ? 'n/a' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%');

/** Whole number with grouping, or '–'. */
export const q0 = (v: N) => (!ok(v) ? '–' : Math.round(v).toLocaleString('en-US'));

/** Number with a fixed number of decimals and grouping, or '–'. */
export const num = (v: N, d = 0) =>
  !ok(v) ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Thousand tonnes on the trade tab: 3 significant-ish digits. */
export const ktf = (v: N) => (!ok(v) ? '–' : v >= 100 ? Math.round(v).toLocaleString('en-US') : v >= 10 ? v.toFixed(1) : v.toFixed(2));

/** US$ per tonne with grouping: "$1,399". */
export const perT = (v: N) => (!ok(v) ? '–' : '$' + Math.round(v).toLocaleString('en-US'));
