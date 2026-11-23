/* Types for the generated legacy CottidStaples landed-cost engine (staples.js). */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface LandedLine {
  key: string;
  label: string;
  value: number;
  [k: string]: any;
}
export interface Landed {
  available: boolean;
  reason?: string;
  commodity: string;
  origin: string;
  originId: string;
  grade: string;
  gradeId: string;
  dest: string;
  destId: string;
  route: string;
  regime: string;
  regimeId: string;
  days: number;
  qty: number;
  fob: number;
  ocean: number;
  insurance: number;
  cif: number;
  customsValue: number;
  duty: number;
  levies: number;
  fees: number;
  excise: number;
  vat: number;
  vatRate: number;
  border: number;
  portCost: number;
  inland: number;
  total: number;
  perKg: number;
  localPerKg: number;
  currency: string;
  shipment: number;
  benchmark: number | null;
  headroom: number | null;
  lines: LandedLine[];
  [k: string]: any;
}
declare const E: {
  forCommodity(lib: any, cid: string): any;
  landed(view: any, s: any): Landed;
  fobToReach(view: any, s: any, target: number): number | null;
  compare(view: any, destId: string, opts?: any): Landed[];
  defaultRegime(list: any[]): any;
};
export default E;
