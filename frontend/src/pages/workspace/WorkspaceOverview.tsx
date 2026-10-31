import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronRight, Loader2, Phone, Send } from 'lucide-react';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectConversation } from '@/store/chat/chatSlice';
import { formatPhone } from '@/store/chat/chatMappers';
import { useRealtimeEvent } from '@/hooks/useRealtime';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { ActivityChart } from '@/components/overview/ActivityChart';
import type { OverviewData, OverviewPeriod } from '@/types/overviewTypes';

const PERIODS: { value: OverviewPeriod; label: string; previous: string }[] = [
  { value: 'today', label: 'Today', previous: 'yesterday' },
  { value: '7d', label: '7 days', previous: 'the previous 7 days' },
  { value: '30d', label: '30 days', previous: 'the previous 30 days' },
];
const REFRESH_MS = 60_000; // Numbers refresh every minute while the page is open
const LIVE_DEBOUNCE_MS = 1500; // Chat events (handover, assignment) refresh the "waiting" numbers soon after

const TICKET_STATUSES = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'ai_handling', label: 'AI handling' },
];
const QUALITY_LABELS: Record<string, { label: string; className: string }> = {
  GREEN: { label: 'High quality', className: 'text-green-700 bg-green-500/10' },
  YELLOW: { label: 'Medium quality', className: 'text-amber-700 bg-amber-500/10' },
  RED: { label: 'Low quality', className: 'text-error bg-error/10' },
};

// 45 s, 3 min, 1 h 20 min
function formatDuration(seconds: number | null) {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function waitedFor(iso: string | null) {
  return iso ? formatDuration((Date.now() - new Date(iso).getTime()) / 1000) : '—';
}

/** Workspace overview: today's (or the period's) activity, who's waiting, the team and the channels — all real numbers. */
export function WorkspaceOverview() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.workspace.user);
  const isSupervisor = user?.role === 'admin' || user?.role === 'manager';
  // Overview is always on: chat, AI and ticket numbers only show with Customer Chats, the latest broadcast with Broadcasts
  const hasChats = useFeatureFlag('customer_chats');
  const hasBroadcasts = useFeatureFlag('broadcasts');
  const [period, setPeriod] = useState<OverviewPeriod>('today');
  const [state, setState] = useState<{ forPeriod: OverviewPeriod | null; data: OverviewData | null; error: string | null }>({ forPeriod: null, data: null, error: null });
  const liveTimer = useRef<number | null>(null);

  const load = useCallback(
    (forPeriod: OverviewPeriod) =>
      api
        .get<OverviewData>('/api/v1/overview/', { params: { period: forPeriod, tz: Intl.DateTimeFormat().resolvedOptions().timeZone } })
        .then((response) => setState((s) => (forPeriod === period ? { forPeriod, data: response.data, error: null } : s)))
        .catch((err) => setState((s) => (forPeriod === period ? { ...s, forPeriod, error: getApiErrorMessage(err, 'Failed to load the overview') } : s))),
    [period]
  );

  // 1. Load on open / period change, then every minute
  useEffect(() => {
    load(period);
    const timer = window.setInterval(() => load(period), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load, period]);

  // 2. A chat was handed over / taken / assigned: refresh soon (one request for a burst of events)
  const refreshSoon = () => {
    if (liveTimer.current !== null) window.clearTimeout(liveTimer.current);
    liveTimer.current = window.setTimeout(() => load(period), LIVE_DEBOUNCE_MS);
  };
  useRealtimeEvent('conversation.handover', refreshSoon);
  useRealtimeEvent('conversation.assigned', refreshSoon);
  useRealtimeEvent('conversation.updated', refreshSoon);
  useEffect(() => () => {
    if (liveTimer.current !== null) window.clearTimeout(liveTimer.current);
  }, []);

  const openChat = (conversationId: number) => {
    dispatch(selectConversation(conversationId));
    navigate('/dashboard/chats');
  };

  const data = state.data;
  const loading = state.forPeriod !== period;
  const previousLabel = PERIODS.find((p) => p.value === period)?.previous ?? '';

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Welcome back, {user?.name?.split(' ')[0] || 'there'}!</h1>
          <p className="text-sm text-on-surface-variant">What's happening in {user?.organization_name || 'your workspace'}.</p>
        </div>

        {/* Period filter: one row above everything it changes */}
        <div className="flex items-center gap-1" role="tablist" aria-label="Period">
          {loading && <Loader2 className="mr-1 w-4 h-4 animate-spin text-on-surface-variant" aria-label="Loading" />}
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer ${
                period === p.value ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {state.error && <p className="text-sm text-error">{state.error}</p>}
      {!data && !state.error && <p className="text-sm text-on-surface-variant">Loading the overview…</p>}

      {data && hasChats && (
        <>
          {/* 1. Headline numbers */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Conversations"
              value={data.cards.conversations.value}
              change={<Change current={data.cards.conversations.value} previous={data.cards.conversations.previous} kind="percent" against={previousLabel} />}
            />
            <StatTile
              label="Solved by the AI alone"
              value={data.cards.ai_handled.percent === null ? '—' : `${data.cards.ai_handled.percent}%`}
              hint={`${data.cards.ai_handled.by_ai} of ${data.cards.ai_handled.closed} closed tickets`}
              change={<Change current={data.cards.ai_handled.percent} previous={data.cards.ai_handled.previous_percent} kind="points" against={previousLabel} />}
            />
            <StatTile
              label="Waiting for a person"
              value={data.cards.waiting_now}
              hint="Right now, not taken by anyone"
              tone={data.cards.waiting_now > 0 ? 'alert' : undefined}
            />
            <StatTile
              label="Avg. first response"
              value={formatDuration(data.cards.first_response.avg_seconds)}
              hint={`After the AI handed over · ${data.cards.first_response.count} chats`}
              change={
                <Change current={data.cards.first_response.avg_seconds} previous={data.cards.first_response.previous_avg_seconds} kind="percent" against={previousLabel} lowerIsBetter />
              }
            />
          </div>

          {/* 2. Needs attention (only when someone is waiting) */}
          {data.waiting.length > 0 && (
            <Card title="Needs attention" subtitle="Customers the AI handed over that nobody has taken yet, waiting longest first." tone="alert">
              <ul className="divide-y divide-outline-variant/20">
                {data.waiting.map((chat) => (
                  <li key={chat.conversation_id}>
                    <button
                      type="button"
                      onClick={() => openChat(chat.conversation_id)}
                      className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-surface-container/60 rounded-lg px-2 -mx-2 cursor-pointer"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-on-surface truncate">{chat.customer_name || formatPhone(chat.customer_phone)}</span>
                        {chat.customer_name && <span className="block text-xs text-on-surface-variant">{formatPhone(chat.customer_phone)}</span>}
                      </span>
                      <span className="text-xs text-on-surface-variant whitespace-nowrap">waiting {waitedFor(chat.waiting_since)}</span>
                      <ChevronRight className="w-4 h-4 text-on-surface-variant" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              {data.cards.waiting_now > data.waiting.length && (
                <p className="text-xs text-on-surface-variant">and {data.cards.waiting_now - data.waiting.length} more in Customer Chats → Unassigned.</p>
              )}
            </Card>
          )}

          {/* 3. Activity */}
          <Card title={data.activity.unit === 'hour' ? 'Messages per hour' : 'Messages per day'} subtitle="Who wrote them: customers, the AI or your team.">
            <ActivityChart activity={data.activity} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* 4. Team */}
            <Card title={isSupervisor ? 'Team' : 'Your work'} subtitle="Open chats right now; replies, closed tickets and first response in this period.">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead className="text-xs text-on-surface-variant">
                    <tr>
                      <th className="text-left font-medium px-1 py-1.5">Member</th>
                      <th className="text-right font-medium px-1 py-1.5">Open chats</th>
                      <th className="text-right font-medium px-1 py-1.5">Replies</th>
                      <th className="text-right font-medium px-1 py-1.5">Closed</th>
                      <th className="text-right font-medium px-1 py-1.5">First response</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums text-on-surface">
                    {data.team.map((member) => (
                      <tr key={member.id} className="border-t border-outline-variant/20">
                        <td className="px-1 py-2">
                          <span className="block font-medium">{member.name}</span>
                          <span className="block text-[11px] text-on-surface-variant capitalize">{member.role}</span>
                        </td>
                        <td className="text-right px-1 py-2">{member.open_chats}</td>
                        <td className="text-right px-1 py-2">{member.replies}</td>
                        <td className="text-right px-1 py-2">{member.tickets_closed}</td>
                        <td className="text-right px-1 py-2">{formatDuration(member.avg_first_response_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* 5. Tickets */}
            <Card title="Tickets" subtitle={`${data.tickets.created} new · ${data.tickets.closed} closed in this period`}>
              <div className="grid grid-cols-4 gap-2">
                {TICKET_STATUSES.map((status) => (
                  <div key={status.key} className="rounded-xl bg-surface-container px-2 py-2.5 text-center">
                    <p className="text-xl font-bold text-on-surface tabular-nums">{data.tickets.open_by_status[status.key] ?? 0}</p>
                    <p className="text-[11px] text-on-surface-variant">{status.label}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-on-surface-variant mb-1.5">Most common topics</p>
                {data.tickets.top_groups.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">No labelled tickets in this period yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.tickets.top_groups.map((group) => (
                      <li key={group.id} className="flex items-center justify-between text-sm">
                        <span className="text-on-surface truncate">{group.name}</span>
                        <span className="font-semibold text-on-surface tabular-nums">{group.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button type="button" onClick={() => navigate('/dashboard/tickets')} className="text-xs font-medium text-primary hover:underline cursor-pointer">
                See all insights on the Tickets page →
              </button>
            </Card>
          </div>
        </>
      )}

      {data && (
        <>
          {/* 6. Channels */}
          <Card title="Channels" subtitle={hasBroadcasts ? 'Your WhatsApp numbers and the latest broadcast.' : 'Your WhatsApp numbers.'}>
            {data.channels.numbers.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No WhatsApp number connected yet.</p>
            ) : (
              <ul className="divide-y divide-outline-variant/20">
                {data.channels.numbers.map((number) => {
                  const quality = QUALITY_LABELS[number.quality_rating] ?? QUALITY_LABELS.GREEN;
                  const connected = number.status === 'connected';
                  return (
                    <li key={number.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <Phone className="w-4 h-4 text-on-surface-variant" aria-hidden="true" />
                      <span className="text-sm font-medium text-on-surface">{number.display_phone_number}</span>
                      {number.verified_name && <span className="text-xs text-on-surface-variant">{number.verified_name}</span>}
                      <span className="ml-auto flex items-center gap-2">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${connected ? 'text-green-700 bg-green-500/10' : 'text-error bg-error/10'}`}>
                          {connected ? 'Connected' : 'Disconnected'}
                        </span>
                        {connected && <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${quality.className}`}>{quality.label}</span>}
                        <span className="text-[11px] text-on-surface-variant">{number.messaging_tier.replace('TIER_', '').replace('UNLIMITED', 'Unlimited')} / day</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {hasBroadcasts && data.channels.latest_broadcast && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 border-t border-outline-variant/20 text-sm">
                <Send className="w-4 h-4 text-on-surface-variant" aria-hidden="true" />
                <span className="font-medium text-on-surface">{data.channels.latest_broadcast.template_name}</span>
                <span className="text-xs text-on-surface-variant capitalize">{data.channels.latest_broadcast.status}</span>
                <span className="ml-auto flex gap-3 text-xs text-on-surface-variant tabular-nums">
                  {['sent', 'delivered', 'read', 'failed'].map((key) => (
                    <span key={key}>
                      <span className="font-semibold text-on-surface">{data.channels.latest_broadcast?.delivery[key] ?? 0}</span> {key}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Card({ title, subtitle, tone, children }: { title: string; subtitle?: string; tone?: 'alert'; children: ReactNode }) {
  return (
    <section className={`p-4 rounded-2xl border bg-surface-container-low space-y-3 ${tone === 'alert' ? 'border-amber-500/40' : 'border-outline-variant/30'}`}>
      <div>
        <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
        {subtitle && <p className="text-xs text-on-surface-variant">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, hint, change, tone }: { label: string; value: number | string; hint?: string; change?: ReactNode; tone?: 'alert' }) {
  return (
    <div className={`p-4 rounded-2xl border bg-surface-container-low ${tone === 'alert' ? 'border-amber-500/50' : 'border-outline-variant/30'}`}>
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone === 'alert' ? 'text-amber-700' : 'text-on-surface'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
      {change}
    </div>
  );
}

// "▲ 12% vs yesterday": green when it's better, red when worse (with an arrow, never colour alone)
function Change({ current, previous, kind, against, lowerIsBetter = false }: { current: number | null; previous: number | null; kind: 'percent' | 'points'; against: string; lowerIsBetter?: boolean }) {
  if (current === null || previous === null) return <p className="mt-1 text-[11px] text-on-surface-variant">No data for {against}</p>;
  // A percentage of zero means nothing: "0 yesterday, 5 today" is shown as 5 more
  if (kind === 'percent' && previous === 0 && current > 0) return <p className="mt-1 text-[11px] text-on-surface-variant">{current} more than {against}</p>;
  const diff = kind === 'points' || previous === 0 ? current - previous : Math.round(((current - previous) / previous) * 100);
  if (diff === 0) return <p className="mt-1 text-[11px] text-on-surface-variant">Same as {against}</p>;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  const Arrow = diff > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={`mt-1 flex items-center gap-0.5 text-[11px] font-medium ${better ? 'text-green-700' : 'text-error'}`}>
      <Arrow className="w-3.5 h-3.5" aria-hidden="true" />
      {Math.abs(diff)}
      {kind === 'points' ? ' pts' : '%'} <span className="font-normal text-on-surface-variant">vs {against}</span>
    </p>
  );
}
