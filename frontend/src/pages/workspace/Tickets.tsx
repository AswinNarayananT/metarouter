import { useEffect, useRef, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, FolderTree, List, Loader2, Search, Ticket as TicketIcon, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectTicket, setTicketFilters } from '@/store/tickets/ticketSlice';
import { fetchTicketDetail, fetchTicketGroups, fetchTickets, TICKETS_PAGE_SIZE } from '@/store/tickets/ticketThunks';
import { fetchTeamMembers } from '@/store/workspace/workspaceThunks';
import { formatListTime, formatPhone } from '@/store/chat/chatMappers';
import { useTicketsRealtimeSync } from '@/hooks/useChatRealtime';
import { markNotificationsRead } from '@/store/notifications/notificationThunks';
import { usePageFocused } from '@/hooks/usePageFocused';
import { TicketDetailPanel } from '@/components/tickets/TicketDetailPanel';
import { TicketHandlerBadge, TicketStatusBadge, TicketTypeBadge } from '@/components/tickets/TicketBadges';
import { TicketInsights } from '@/components/tickets/TicketInsights';
import { TicketGroupManager } from '@/components/tickets/TicketGroupManager';
import { TicketMemberFilter } from '@/components/tickets/TicketMemberFilter';
import { TicketFiltersMenu } from '@/components/tickets/TicketFiltersMenu';
import type { TicketTab, TicketType } from '@/types/ticketTypes';

const SEARCH_DEBOUNCE_MS = 300;

const TABS: { id: TicketTab; label: string; hint: string }[] = [
  { id: 'mine', label: 'My tickets', hint: 'Tickets assigned to you' },
  { id: 'active', label: 'Needs team', hint: 'Open tickets your team is working on' },
  { id: 'ai_handling', label: 'With AI', hint: 'Tickets the AI is handling' },
  { id: 'closed', label: 'Closed', hint: 'Finished tickets' },
  { id: 'all', label: 'All', hint: 'Every ticket' },
];

const TYPE_LABELS: Record<TicketType, string> = { enquiry: 'Enquiry', problem: 'Problem', complaint: 'Complaint' };

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove filter: ${label}`} className="p-0.5 rounded-full hover:bg-primary/15 cursor-pointer">
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

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
  const groupName = groups.find((g) => g.id === filters.groupId)?.name;
  const listTop = useRef<HTMLDivElement>(null);

  // What the Filters button holds, and whether anything at all narrows the list
  const menuFilterCount = (filters.type ? 1 : 0) + (filters.groupId ? 1 : 0) + (filters.subgroupId ? 1 : 0);
  const hasFilters = menuFilterCount > 0 || filters.memberId !== null || filters.search.trim() !== '';

  const clearFilters = () => {
    dispatch(setTicketFilters({ type: '', groupId: null, subgroupId: null, memberId: null, search: '' }));
    setSearchText('');
  };

  // Insights -> "show me these tickets": every ticket of that subgroup
  const showSubgroup = (subgroupId: number) => {
    dispatch(setTicketFilters({ tab: 'all', subgroupId, groupId: null, type: '', memberId: null, search: '' }));
    setSearchText('');
    setView('list');
  };

  const goToPage = (nextPage: number) => {
    dispatch(fetchTickets({ page: nextPage }));
    listTop.current?.scrollIntoView({ block: 'start' });
  };

  // 1. Load the list whenever a filter changes, and the groups for the group filter
  useEffect(() => {
    dispatch(fetchTickets({ page: 1 }));
  }, [dispatch, filters]);
  useEffect(() => {
    dispatch(fetchTicketGroups());
    dispatch(fetchTeamMembers());
  }, [dispatch]);

  // A page left empty (its tickets moved or closed meanwhile): step back to the page before it
  useEffect(() => {
    if (!isLoading && !loadError && items.length === 0 && page > 1) dispatch(fetchTickets({ page: page - 1 }));
  }, [dispatch, isLoading, loadError, items.length, page]);

  // 2. Search after the user stops typing
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchText !== filters.search) dispatch(setTicketFilters({ search: searchText }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch, searchText, filters.search]);

  // Looking at a ticket = its notifications ("assigned you ticket #12") are dealt with (only while the tab is in front)
  const notifications = useAppSelector((state) => state.notifications.items);
  const pageFocused = usePageFocused();
  const hasUnreadForTicket = selectedId !== null && notifications.some((n) => n.ticket?.id === selectedId && !n.read_at);
  useEffect(() => {
    if (pageFocused && selectedId !== null && hasUnreadForTicket) dispatch(markNotificationsRead({ ticketId: selectedId }));
  }, [dispatch, pageFocused, selectedId, hasUnreadForTicket]);

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
    <div className="space-y-5">
      <p className="text-sm text-on-surface-variant">
        Customer problems and requests, whether the AI or your team is handling them.
      </p>

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
              title={tab.hint}
              onClick={() => dispatch(setTicketFilters({ tab: tab.id, ...(tab.id === 'mine' ? { memberId: null } : {}) }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                active ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
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
            placeholder="Search ticket number, subject or customer"
            aria-label="Search tickets"
            className="w-full pl-9 pr-4 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
          />
        </div>
        {/* "My tickets" already means assigned to you */}
        {filters.tab !== 'mine' && <TicketMemberFilter memberId={filters.memberId} onChange={(memberId) => dispatch(setTicketFilters({ memberId }))} />}
        <TicketFiltersMenu type={filters.type} groupId={filters.groupId} activeCount={menuFilterCount} groups={groups} onChange={(next) => dispatch(setTicketFilters(next))} />
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {menuFilterCount > 0 && <span className="text-xs text-on-surface-variant">Filtered by:</span>}
          {filters.type && <FilterChip label={TYPE_LABELS[filters.type]} onRemove={() => dispatch(setTicketFilters({ type: '' }))} />}
          {groupName && <FilterChip label={groupName} onRemove={() => dispatch(setTicketFilters({ groupId: null }))} />}
          {subgroupName && <FilterChip label={`${subgroupName.groupName} › ${subgroupName.name}`} onRemove={() => dispatch(setTicketFilters({ subgroupId: null }))} />}
          <button type="button" onClick={clearFilters} className="text-xs font-medium text-primary underline underline-offset-2 cursor-pointer">
            Clear all
          </button>
        </div>
      )}

      <div ref={listTop} className="scroll-mt-4">
        {total > 0 && items.length > 0 && (
          <p className="text-xs text-on-surface-variant" aria-live="polite">
            Showing {(page - 1) * TICKETS_PAGE_SIZE + 1}-{(page - 1) * TICKETS_PAGE_SIZE + items.length} of {total}
          </p>
        )}
      </div>

      {/* List */}
      <div aria-busy={isLoading} className={`rounded-2xl border border-outline-variant/30 bg-surface-container-low overflow-hidden transition-opacity ${isLoading && items.length > 0 ? 'opacity-60' : ''}`}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-on-surface-variant" />
            ) : (
              <>
                <TicketIcon className="w-8 h-8 text-on-surface-variant/50" />
                <p className="text-sm text-on-surface-variant">{loadError ?? (hasFilters ? 'No tickets match these filters.' : 'No tickets here yet.')}</p>
                {hasFilters && !loadError && (
                  <button type="button" onClick={clearFilters} className="text-sm font-medium text-primary underline underline-offset-2 cursor-pointer">
                    Clear all filters
                  </button>
                )}
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

      {totalPages > 1 && (
        <nav aria-label="Ticket pages" className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={isLoading || page <= 1}
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-sm text-on-surface-variant">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={isLoading || page >= totalPages}
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </nav>
      )}

      </>
      )}

      {selectedId !== null && (
        <TicketDetailPanel detail={detail} isLoading={isLoadingDetail} error={detailError} onClose={() => dispatch(selectTicket(null))} />
      )}
    </div>
  );
}
