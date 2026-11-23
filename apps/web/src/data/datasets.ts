import { useQueries, useQuery } from '@tanstack/react-query';
import type {
  AboutData,
  ApiRow,
  Call,
  EventRec,
  FTData,
  Intervention,
  LIBData,
  MapData,
  NUTData,
  Policy,
  REGData,
  SELLData,
  Source,
  TSData,
} from '@afb/engines';

/** Reference datasets published by tools/build-data.ts to /data/*.json (cached stale-while-revalidate). */
export interface Datasets {
  TS: TSData;
  LIB: LIBData;
  REG: REGData;
  SRC: Source[];
  NUT: NUTData;
  FT: FTData;
  SELL: SELLData;
  CALLS: Call[];
  EVENTS: EventRec[];
  POL: Policy[];
  /** Intervention types [id, label]. */
  DEVT: [string, string][];
  /** Funder types id -> label. */
  DEVF: Record<string, string>;
  /** Programmes: interventions and the funders behind them. */
  PROG: Intervention[];
  ABOUT: AboutData;
  MAP: MapData;
  APIS: ApiRow[];
  summary: Summary;
}
export type DatasetName = keyof Datasets;

export interface Summary {
  built: string;
  baseYear: number;
  tradeYear: number;
  nutYear: number;
  countries: Record<string, { ssr: number | null; imp: number | null; exp: number | null; kcal: number | null; prot: number | null }>;
  stats: {
    countries: number;
    foods: number;
    groups: number;
    grownAtHome: number;
    horizon: number;
    points: number;
    africaImports: number;
    africaExports: number;
  };
  climate: TSData['climate'];
  backtest: { y1: number; y5: number };
  markets: Record<string, string>;
  regions: Record<string, string[]>;
  core: string[];
  foods: Record<string, { label: string; fg: string }>;
  foodGroups: [string, string][];
  traded: string[];
}

async function fetchDataset<K extends DatasetName>(name: K): Promise<Datasets[K]> {
  const res = await fetch(`/data/${name}.json`);
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  return (await res.json()) as Datasets[K];
}

const options = <K extends DatasetName>(name: K) => ({
  queryKey: ['dataset', name],
  queryFn: () => fetchDataset(name),
  staleTime: Infinity,
  gcTime: Infinity,
});

export function useDataset<K extends DatasetName>(name: K) {
  return useQuery(options(name));
}

/** Loads several datasets; `data` is set once all have loaded. */
export function useDatasets<K extends DatasetName>(...names: K[]) {
  const results = useQueries({ queries: names.map((n) => options(n)) });
  const error = results.find((r) => r.error)?.error ?? null;
  const ready = results.every((r) => r.data !== undefined);
  const data = ready
    ? (Object.fromEntries(names.map((n, i) => [n, results[i]!.data])) as Pick<Datasets, K>)
    : null;
  return { data, error, loading: !ready && !error };
}

export async function fetchContent(page: 'about' | 'methods' | 'terms'): Promise<string> {
  const res = await fetch(`/data/content/${page}.html`);
  if (!res.ok) throw new Error(`Could not load ${page}`);
  return res.text();
}
