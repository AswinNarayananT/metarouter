import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import { formatPhone } from '@/store/chat/chatMappers';
import type { TicketInsights as Insights } from '@/types/ticketTypes';

const PERIODS = [7, 30, 90];

function formatHours(hours: number | null) {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

/** Ticket insights: what customers need most, what keeps coming back, and how much the AI solves alone. */
export function TicketInsights({ onShowSubgroup }: { onShowSubgroup: (subgroupId: number) => void }) {
  const [days, setDays] = useState(30);
  const [state, setState] = useState<{ forDays: number | null; data: Insights | null; error: string | null }>({ forDays: null, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    api
      .get<Insights>('/api/v1/tickets/insights', { params: { days } })
      .then((response) => !cancelled && setState({ forDays: days, data: response.data, error: null }))
      .catch((err) => !cancelled && setState({ forDays: days, data: null, error: getApiErrorMessage(err, 'Failed to load insights') }));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const loading = state.forDays !== days;
  const data = state.data;

  return (
    <div className="space-y-5">
      {/* Period filter: one row above the charts */}
      <div className="flex items-center gap-1" role="tablist" aria-label="Period">
        {PERIODS.map((period) => (
          <button
            key={period}
            type="button"
            role="tab"
            aria-selected={days === period}
            onClick={() => setDays(period)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer ${
              days === period ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            Last {period} days
          </button>
        ))}
        {loading && <Loader2 className="ml-2 w-4 h-4 animate-spin text-on-surface-variant" />}
      </div>

      {state.error && <p className="text-sm text-error">{state.error}</p>}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatTile label="Tickets" value={data.totals.tickets} hint={`${data.totals.problems} problems · ${data.totals.complaints} complaints · ${data.totals.enquiries} enquiries`} />
            <AiShareTile closedByAi={data.totals.closed_by_ai} total={data.totals.tickets} />
            <StatTile label="Waiting on the team" value={data.totals.waiting_on_team} hint={`${data.totals.team_tickets} needed a person this period`} />
            <StatTile
              label="Avg. time to close"
              value={formatHours(data.totals.avg_close_hours_team)}
              hint={`Team · AI: ${formatHours(data.totals.avg_close_hours_ai)}`}
            />
          </div>

          <Card title="Tickets per day">
            <DailyChart daily={data.daily} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Top problems" subtitle="Subgroups with the most tickets. Click one to see its tickets.">
              <RankedBars
                rows={data.top_subgroups.map((row) => ({
                  key: row.subgroup_id,
                  label: row.subgroup,
                  sublabel: [row.group, row.complaints ? `${row.complaints} complaints` : null, `AI solved ${row.closed_by_ai}`].filter(Boolean).join(' · '),
                  value: row.count,
                  onClick: () => onShowSubgroup(row.subgroup_id),
                }))}
                empty="No filed tickets yet."
              />
            </Card>
            <Card title="Complaints by group">
              <RankedBars rows={data.complaints_by_group.map((row) => ({ key: row.group_id, label: row.group, value: row.count }))} empty="No complaints in this period." />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Rising this week" subtitle="Compared with the week before">
              {data.rising.length === 0 ? (
                <p className="text-sm text-on-surface-variant">Nothing is rising right now.</p>
              ) : (
                <ul className="space-y-2">
                  {data.rising.map((row) => (
                    <li key={row.subgroup_id}>
                      <button
                        type="button"
                        onClick={() => onShowSubgroup(row.subgroup_id)}
                        className="w-full flex items-center justify-between gap-3 p-2 rounded-lg text-left hover:bg-surface-container cursor-pointer"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm text-on-surface truncate">{row.subgroup}</span>
                          {row.group && <span className="block text-xs text-on-surface-variant truncate">{row.group}</span>}
                        </span>
                        <span className="flex items-center gap-1 text-sm font-semibold text-on-surface shrink-0">
                          <TrendingUp className="w-4 h-4 text-on-surface-variant" aria-hidden="true" />
                          {row.last_week} → {row.this_week}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Repeat customers" subtitle="Two or more tickets about the same problem">
              {data.repeat_customers.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No repeat problems in this period.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-on-surface-variant">
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 font-medium">Problem</th>
                      <th className="pb-2 font-medium text-right">Tickets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.repeat_customers.map((row) => (
                      <tr key={`${row.conversation_id}-${row.subgroup}`} className="border-t border-outline-variant/20">
                        <td className="py-2 text-on-surface">{row.customer_name || formatPhone(row.customer_phone)}</td>
                        <td className="py-2 text-on-surface-variant">{row.subgroup}</td>
                        <td className="py-2 text-right font-semibold text-on-surface tabular-nums">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="p-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
        {subtitle && <p className="text-xs text-on-surface-variant">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="p-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className="mt-1 text-3xl font-bold text-on-surface tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
    </div>
  );
}

// A single ratio against its whole: a meter, not a pie
function AiShareTile({ closedByAi, total }: { closedByAi: number; total: number }) {
  const share = total ? Math.round((closedByAi / total) * 100) : 0;
  return (
    <div className="p-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low">
      <p className="text-xs text-on-surface-variant">Solved by the AI alone</p>
      <p className="mt-1 text-3xl font-bold text-on-surface tabular-nums">{share}%</p>
      <div className="mt-2 h-2 rounded-full bg-primary/15" role="meter" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100} aria-label="Share solved by the AI">
        <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-1 text-xs text-on-surface-variant">
        {closedByAi} of {total} tickets
      </p>
    </div>
  );
}

// Horizontal bars, one hue, value labelled at the end (the numbers are the table view)
function RankedBars({ rows, empty }: { rows: { key: number; label: string; sublabel?: string; value: number; onClick?: () => void }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-on-surface-variant">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const content = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-on-surface truncate">{row.label}</span>
              <span className="text-sm font-semibold text-on-surface tabular-nums shrink-0">{row.value}</span>
            </span>
            <span className="mt-1 block h-2 rounded-r bg-transparent" aria-hidden="true">
              <span className="block h-full rounded-r-[4px] bg-primary" style={{ width: `${(row.value / max) * 100}%` }} />
            </span>
            {row.sublabel && <span className="mt-0.5 block text-[11px] text-on-surface-variant truncate">{row.sublabel}</span>}
          </>
        );
        return (
          <li key={row.key}>
            {row.onClick ? (
              <button type="button" onClick={row.onClick} className="w-full -mx-2 px-2 py-1 rounded-lg text-left hover:bg-surface-container cursor-pointer">
                {content}
              </button>
            ) : (
              <div className="py-1">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Column chart, one hue; hover a day for its count (hit area is the full column)
function DailyChart({ daily }: { daily: { date: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...daily.map((d) => d.count), 1);
  const label = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
  const tickEvery = Math.ceil(daily.length / 6);

  return (
    <div className="space-y-1">
      <div className="relative h-40 flex items-end gap-[2px] border-b border-outline-variant/40" onMouseLeave={() => setHover(null)}>
        {daily.map((day, index) => (
          <div
            key={day.date}
            className="relative flex-1 h-full flex items-end cursor-default"
            onMouseEnter={() => setHover(index)}
            onFocus={() => setHover(index)}
            tabIndex={0}
            aria-label={`${label(day.date)}: ${day.count} tickets`}
          >
            <div
              className={`w-full rounded-t-[4px] ${hover === index ? 'bg-primary' : 'bg-primary/80'}`}
              style={{ height: day.count ? `${Math.max(4, (day.count / max) * 100)}%` : '0%' }}
            />
            {hover === index && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-lg bg-on-surface text-surface text-[11px] whitespace-nowrap z-10 pointer-events-none">
                {label(day.date)} · <span className="font-semibold">{day.count}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] text-[10px] text-on-surface-variant">
        {daily.map((day, index) => (
          <span key={day.date} className="flex-1 text-center overflow-visible whitespace-nowrap">
            {index % tickEvery === 0 ? label(day.date) : ''}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Tickets per day</caption>
        <tbody>
          {daily.map((day) => (
            <tr key={day.date}>
              <th>{day.date}</th>
              <td>{day.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
