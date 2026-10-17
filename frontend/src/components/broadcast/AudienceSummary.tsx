import { AlertTriangle, Send } from 'lucide-react';
import type { AudienceCounts } from '@/types/broadcastTypes';

/** Who will receive the broadcast and why the others were left out. */
export function AudienceSummary({ counts, tierError }: { counts: AudienceCounts; tierError?: string | null }) {
  const skipped = [
    { label: 'Duplicate numbers', value: counts.duplicates_removed },
    { label: 'Invalid numbers', value: counts.skipped_invalid },
    { label: 'Opted out', value: counts.skipped_opted_out },
    { label: 'Messaged in the last 7 days', value: counts.skipped_recent },
  ];
  const totalSkipped = skipped.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
        <span className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Send className="w-5 h-5" />
        </span>
        <div>
          <p className="text-2xl font-bold text-on-surface leading-tight">{counts.queued_count.toLocaleString()}</p>
          <p className="text-sm text-on-surface-variant">
            will receive this message, out of {counts.total_input.toLocaleString()} {counts.total_input === 1 ? 'contact' : 'contacts'}
          </p>
        </div>
      </div>

      {totalSkipped > 0 && (
        <div className="rounded-xl border border-outline-variant/30 divide-y divide-outline-variant/30">
          <p className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Left out ({totalSkipped.toLocaleString()})
          </p>
          {skipped
            .filter((s) => s.value > 0)
            .map((s) => (
              <div key={s.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-on-surface-variant">{s.label}</span>
                <span className="font-medium text-on-surface">{s.value.toLocaleString()}</span>
              </div>
            ))}
        </div>
      )}

      {tierError && (
        <div role="alert" className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{tierError}</span>
        </div>
      )}
    </div>
  );
}
