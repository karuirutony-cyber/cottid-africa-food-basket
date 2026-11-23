import type { Summary } from '@/data/datasets';
import { Select } from './ui';

/** Country select grouped by region, as on the legacy page. */
export function CountrySelect({
  summary,
  value,
  onChange,
  label = 'Country',
  only,
  className,
}: {
  summary: Pick<Summary, 'regions' | 'markets'>;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  only?: (id: string) => boolean;
  className?: string;
}) {
  return (
    <Select label={label} value={value} onChange={onChange} className={className}>
      {Object.entries(summary.regions).map(([r, ids]) => (
        <optgroup key={r} label={`${r} Africa`}>
          {ids
            .filter((k) => summary.markets[k] && (!only || only(k)))
            .map((k) => [k, summary.markets[k]!] as const)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

/** Food select grouped by food group. */
export function FoodSelect({
  summary,
  value,
  onChange,
  label = 'Food',
  only,
  className,
  allLabel,
}: {
  summary: Pick<Summary, 'foods' | 'foodGroups'>;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  only?: (id: string) => boolean;
  className?: string;
  allLabel?: string;
}) {
  return (
    <Select label={label} value={value} onChange={onChange} className={className}>
      {allLabel && <option value="all">{allLabel}</option>}
      {summary.foodGroups.map(([g, gl]) => {
        const list = Object.entries(summary.foods).filter(([k, f]) => f.fg === g && (!only || only(k)));
        return list.length ? (
          <optgroup key={g} label={gl}>
            {list.map(([k, f]) => (
              <option key={k} value={k}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </Select>
  );
}
