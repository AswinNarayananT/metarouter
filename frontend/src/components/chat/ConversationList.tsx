import { useEffect, useRef } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { ChatConversation, ChatFilterCounts, ChatFilterTab } from '@/types/chatTypes';
import { ConversationListItem } from './ConversationListItem';

const FILTER_TABS: { id: ChatFilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'ai', label: 'AI' },
];

/** Left column: search, filter tabs and the list of conversations. */
export function ConversationList({
  conversations,
  counts,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  emptyMessage = 'No conversations found.',
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  className = '',
}: {
  conversations: ChatConversation[];
  counts: ChatFilterCounts;
  query: string;
  onQueryChange: (value: string) => void;
  filter: ChatFilterTab;
  onFilterChange: (tab: ChatFilterTab) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  emptyMessage?: string; // Loading / error text when there's nothing to list
  hasMore?: boolean;       // More chats on the server
  isLoadingMore?: boolean;
  onLoadMore?: () => void; // Called when the end of the list scrolls into view
  className?: string;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const endRef = useRef<HTMLLIElement>(null);
  const loadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  });

  // Infinite scroll: when the marker after the last chat comes near the bottom, load the next page
  useEffect(() => {
    const end = endRef.current;
    if (!end || !hasMore) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMoreRef.current?.(), {
      root: listRef.current,
      rootMargin: '200px',
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasMore, conversations.length]);

  return (
    <aside
      className={`${className} w-full md:w-80 lg:w-96 shrink-0 flex-col border-r border-border-subtle bg-surface-container-lowest`}
    >
      <div className="px-4 pt-4 pb-3 space-y-3 border-b border-border-subtle">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search name, number or message"
            aria-label="Search conversations"
            className="w-full pl-9 pr-4 py-2 bg-surface-container border border-transparent rounded-control text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:bg-surface-container-lowest transition-colors"
          />
        </div>

        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter conversations">
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFilterChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary-fixed text-on-primary-fixed'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                {tab.label}
                <span
                  className={`min-w-5 px-1 rounded-full text-[10px] ${active ? 'bg-on-primary-fixed/10' : 'bg-surface-container-lowest'}`}
                >
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ul ref={listRef} className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <li className="p-8 text-center text-sm text-on-surface-variant">{emptyMessage}</li>
        ) : (
          conversations.map((c) => (
            <li key={c.id}>
              <ConversationListItem
                conversation={c}
                active={c.id === selectedId}
                onSelect={() => onSelect(c.id)}
              />
            </li>
          ))
        )}
        {hasMore && (
          <li ref={endRef} className="flex justify-center py-4" aria-label="Loading more chats">
            {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin text-on-surface-variant" />}
          </li>
        )}
      </ul>
    </aside>
  );
}
