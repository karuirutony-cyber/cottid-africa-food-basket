import type { ReactNode } from 'react';
import { KiondoBand } from '@afb/ui';

/** Page title in the section colour, with the kiondo band under it. */
export function PageHeader({ kicker, title, lead }: { kicker?: string; title: string; lead?: ReactNode }) {
  return (
    <div className="pb-2 pt-8">
      {kicker && (
        <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-sec-ink">{kicker}</p>
      )}
      <h1 className="m-0 mt-1 text-[clamp(26px,3.2vw,38px)] font-bold leading-tight text-sec-ink">{title}</h1>
      <KiondoBand height={8} className="mt-3 max-w-[84px] rounded-sm" />
      {lead && <p className="mt-3 max-w-[68ch] text-muted">{lead}</p>}
    </div>
  );
}
