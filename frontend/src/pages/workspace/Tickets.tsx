import { useEffect, useState } from 'react';
import { BarChart3, FolderTree, List, Loader2, Search, Ticket as TicketIcon, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectTicket, setTicketFilters } from '@/store/tickets/ticketSlice';
import { fetchTicketDetail, fetchTicketGroups, fetchTickets } from '@/store/tickets/ticketThunks';
import { formatListTime, formatPhone } from '@/store/chat/chatMappers';
import { useTicketsRealtimeSync } from '@/hooks/useChatRealtime';
import { TicketDetailPanel } from '@/components/tickets/TicketDetailPanel';
import { TicketHandlerBadge, TicketStatusBadge, TicketTypeBadge } from '@/components/tickets/TicketBadges';
import { TicketInsights } from '@/components/tickets/TicketInsights';
import { TicketGroupManager } from '@/components/tickets/TicketGroupManager';
import type { TicketTab, TicketType } from '@/types/ticketTypes';

const SEARCH_DEBOUNCE_MS = 300;

const TABS: { id: TicketTab; label: string }[] = [
  { id: 'active', label: 'Team work' },
  { id: 'ai_handling', label: 'AI handling' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
];

const selectClass =
  'px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary cursor-pointer';

export function Tickets() {
  const dispatch = useAppDispatch();
  const { items, total, page, totalPages, statusCounts, filters, isLoading, loadError, groups, selectedId, detail, isLoadingDetail, detailError } = useAppSelector(
    (state) => state.tickets
  );
  const [searchText, setSearchText] = useState(filters.search);
  const [view, setView] = useState<'list' | 'insights' | 'groups'>('list');
  const role = useAppSelector((state) => state.workspace.user?.role);
  const isSupervisor = role === 'admin' || role === 'manager';
  const subgroupName = groups.flatMap((g) => g.subgroups.map((sg) => ({ ...sg, groupName: g.name }))).find((sg) => sg.id === filters.subgroupId);

  // Insights -> "show me these tickets": every ticket of that subgroup
  const showSubgroup = (subgroupId: number) => {
    dispatch(setTicketFilters({ tab: 'all', subgroupId, groupId: null, type: '', handledBy: '', search: '' }));
    setSearchText('');
    setView('list');
  };

  // 1. Load the list whenever a filter changes, and the groups for the group filter
  useEffect(() => {
    dispatch(fetchTickets({ page: 1 }));
  }, [dispatch, filters]);
  useEffect(() => {
    dispatch(fetchTicketGroups());
  }, [dispatch]);

  // 2. Search after the user stops typing
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchText !== filters.search) dispatch(setTicketFilters({ search: searchText }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch, searchText, filters.search]);

  // 3. Live updates; leaving the page closes the details panel
  useTicketsRealtimeSync();
  useEffect(() => () => {
    dispatch(selectTicket(null));
  }, [dispatch]);

  const openTicket = (ticketId: number) => {
    dispatch(selectTicket(ticketId));
    dispatch(fetchTicketDetail(ticketId));
  };

  const tabCount = (tab: TicketTab) => {
    if (tab === 'active') return (statusCounts.open ?? 0) + (statusCounts.in_progress ?? 0) + (statusCounts.waiting ?? 0);
    if (tab === 'all') return Object.values(statusCounts).reduce((sum, n) => sum + (n ?? 0), 0);
    if (tab === 'mine') return null;
    return statusCounts[tab] ?? 0;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Tickets</h1>
        <p className="text-sm text-on-surface-variant">
          Every support conversation becomes a ticket, whether the AI or your team handled it. Use the groups to spot the most common and repeated problems.
        </p>
      </div>

      {/* Views */}
      <div className="flex gap-1 p-1 w-fit rounded-xl bg-surface-container" role="tablist" aria-label="View">
        {[
          { id: 'list' as const, label: 'Tickets', icon: List },
          { id: 'insights' as const, label: 'Insights', icon: BarChart3 },
          ...(isSupervisor ? [{ id: 'groups' as const, label: 'Groups', icon: FolderTree }] : []),
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer ${
              view === id ? 'bg-surface-container-low text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {view === 'insights' && <TicketInsights onShowSubgroup={showSubgroup} />}
      {view === 'groups' && <TicketGroupManager />}

      {view === 'list' && (
      <>
      {/* Tabs */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Ticket status">
        {TABS.map((tab) => {
          const active = filters.tab === tab.id;
          const count = tabCount(tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => dispatch(setTicketFilters({ tab: tab.id }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                active ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              {tab.label}
              {count !== null && <span className={`min-w-5 px-1 rounded-full text-[10px] ${active ? 'bg-on-primary/20' : 'bg-surface-container'}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search #number, subject or customer"
            aria-label="Search tickets"
            className="w-full pl-9 pr-4 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
          />
        </div>
        <select aria-label="Type" value={filters.type} onChange={(e) => dispatch(setTicketFilters({ type: e.target.value as TicketType | '' }))} className={selectClass}>
          <option value="">All types</option>
          <option value="enquiry">Enquiry</option>
          <option value="problem">Problem</option>
          <option value="complaint">Complaint</option>
        </select>
        <select
          aria-label="Handled by"
          value={filters.handledBy}
          onChange={(e) => dispatch(setTicketFilters({ handledBy: e.target.value as 'ai' | 'human' | '' }))}
          className={selectClass}
        >
          <option value="">AI or team</option>
          <option value="ai">AI only</option>
          <option value="human">Team</option>
        </select>
        <select
          aria-label="Group"
          value={filters.groupId ?? ''}
          onChange={(e) => dispatch(setTicketFilters({ groupId: e.target.value ? Number(e.target.value) : null, subgroupId: null }))}
          className={selectClass}
        >
          <option value="">All groups</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.ticket_count})
            </option>
          ))}
        </select>
      </div>

      {subgroupName && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            {subgroupName.groupName} › {subgroupName.name}
            <button type="button" onClick={() => dispatch(setTicketFilters({ subgroupId: null }))} aria-label="Clear subgroup filter" className="p-0.5 rounded-full hover:bg-primary/15 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      )}

      {/* List */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low overflow-hidden">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-on-surface-variant" />
            ) : (
              <>
                <TicketIcon className="w-8 h-8 text-on-surface-variant/50" />
                <p className="text-sm text-on-surface-variant">{loadError ?? 'No tickets here yet. They appear as customers chat with you.'}</p>
              </>
            )}
          </div>
        ) : (
          <ul>
            {items.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => openTicket(ticket.id)}
                  aria-current={ticket.id === selectedId ? 'true' : undefined}
                  className={`w-full flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 text-left border-b border-outline-variant/20 transition-colors cursor-pointer ${
                    ticket.id === selectedId ? 'bg-primary/5' : 'hover:bg-surface-container'
                  }`}
                >
                  <span className="text-xs font-mono text-on-surface-variant w-12 shrink-0">#{ticket.number}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-on-surface truncate">{ticket.subject}</span>
                    <span className="block text-xs text-on-surface-variant truncate">
                      {ticket.customer_name || formatPhone(ticket.customer_phone ?? '')}
                      {ticket.subgroup && ` · ${ticket.group?.name} › ${ticket.subgroup.name}`}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <TicketTypeBadge type={ticket.type} />
                    <TicketStatusBadge status={ticket.status} />
                    <TicketHandlerBadge ticket={ticket} />
                  </span>
                  <span className="text-[11px] text-on-surface-variant w-16 shrink-0 sm:text-right">{formatListTime(ticket.updated_at ?? ticket.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {page < totalPages && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => dispatch(fetchTickets({ page: page + 1 }))}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container disabled:opacity-60 cursor-pointer"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />} Load more ({items.length} of {total})
          </button>
        </div>
      )}

      </>
      )}

      {selectedId !== null && (
        <TicketDetailPanel detail={detail} isLoading={isLoadingDetail} error={detailError} onClose={() => dispatch(selectTicket(null))} />
      )}
    </div>
  );
}
