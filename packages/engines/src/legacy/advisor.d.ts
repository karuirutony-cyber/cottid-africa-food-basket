/* Types for the generated legacy CottidAdvisor engine (advisor.js). */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Scenario } from './forecast';
export interface AdviceNote {
  kind: string;
  t: string;
  d: string;
  src: string[];
  conf?: string;
  [k: string]: any;
}
declare const ADV: {
  AUDIENCES: [string, string][];
  LEVERS: any;
  NATIONAL: any;
  SUIT: any;
  inEastAfrica(mid: string): boolean;
  quality(TS: any, cid: string, mid: string): { grade: 'high' | 'medium' | 'low'; why: string[] };
  context(TS: any, LIB: any, cid: string, mid: string, scenario: Scenario): any;
  suggestedTarget(TS: any, cid: string, mid: string, year: number, scenario: Scenario): number | null;
  interventions(TS: any, cid: string, mid: string, plan: any): any;
  advise(TS: any, LIB: any, cid: string, mid: string, audience: string, scenario: Scenario): { notes: AdviceNote[]; ctx: any };
  fmt: Record<string, (v: number) => string>;
};
export default ADV;
