import { useState } from 'react';
import { Table2 } from 'lucide-react';
import type { OverviewData } from '@/types/overviewTypes';

// Categorical slots 1-3 in fixed order (validated: CVD-safe adjacent pairs; aqua is under 3:1 contrast, so totals and a table are visible)
const SERIES = [
  { key: 'customer', label: 'Customers', color: '#2a78d6' },
  { key: 'ai', label: 'AI', color: '#eb6834' },
  { key: 'agent', label: 'Agents', color: '#1baf7a' },
] as const;

type Bucket = OverviewData['activity']['buckets'][number];

function bucketLabel(start: string, unit: 'hour' | 'day', long = false) {
  const date = new Date(start); // No zone in the string: read as the viewer's local time, which is what the server bucketed by
  if (unit === 'hour') return date.toLocaleTimeString([], { hour: 'numeric', ...(long ? { minute: '2-digit' } : {}) });
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', ...(long ? { weekday: 'short' } : {}) });
}

/** Messages per hour / day, stacked by who wrote them. */
export function ActivityChart({ activity }: { activity: OverviewData['activity'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const { unit, buckets } = activity;
  const total = (b: Bucket) => b.customer + b.ai + b.agent;
  const max = Math.max(...buckets.map(total), 1);
  const totals = SERIES.map((s) => buckets.reduce((sum, b) => sum + b[s.key], 0));
  const tickEvery = Math.ceil(buckets.length / 8);

  return (
    <div className="space-y-3">
      {/* Legend with totals (identity never by colour alone), and the table toggle */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {SERIES.map((s, i) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.label} <span className="font-semibold text-on-surface tabular-nums">{totals[i]}</span>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className="ml-auto flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
        >
          <Table2 className="w-3.5 h-3.5" /> {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-on-surface-variant">
              <tr>
                <th className="text-left font-medium py-1">{unit === 'hour' ? 'Hour' : 'Day'}</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="text-right font-medium py-1">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-on-surface tabular-nums">
              {buckets.map((b) => (
                <tr key={b.start} className="border-t border-outline-variant/20">
                  <td className="py-1">{bucketLabel(b.start, unit, true)}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="text-right py-1">{b[s.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="relative h-44 flex items-end gap-[2px] border-b border-outline-variant/40" onMouseLeave={() => setHover(null)}>
            {buckets.map((b, index) => (
              <div
                key={b.start}
                className="relative flex-1 h-full flex items-end cursor-default"
                onMouseEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${bucketLabel(b.start, unit, true)}: ${b.customer} customer, ${b.ai} AI, ${b.agent} agent messages`}
              >
                {/* Stack: customers at the base, 2px surface gaps between segments, rounded top only */}
                <div className={`w-full flex flex-col-reverse gap-[2px] ${hover !== null && hover !== index ? 'opacity-60' : ''}`} style={{ height: `${(total(b) / max) * 100}%` }}>
                  {SERIES.filter((s) => b[s.key] > 0).map((s, i, shown) => (
                    <div
                      key={s.key}
                      className={i === shown.length - 1 ? 'rounded-t-[4px]' : ''}
                      style={{ flexGrow: b[s.key], flexBasis: 0, minHeight: 2, background: s.color }}
                    />
                  ))}
                </div>
                {hover === index && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2.5 py-1.5 rounded-lg bg-on-surface text-surface text-[11px] whitespace-nowrap z-10 pointer-events-none space-y-0.5">
                    <p className="font-semibold">{bucketLabel(b.start, unit, true)}</p>
                    {SERIES.map((s) => (
                      <p key={s.key} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                        {s.label} <span className="ml-auto pl-3 font-semibold tabular-nums">{b[s.key]}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-[2px] text-[10px] text-on-surface-variant">
            {buckets.map((b, index) => (
              <span key={b.start} className="flex-1 text-center whitespace-nowrap">
                {index % tickEvery === 0 ? bucketLabel(b.start, unit) : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
