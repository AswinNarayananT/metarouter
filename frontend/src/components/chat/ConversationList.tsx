import { Search } from 'lucide-react';
import type { ChatConversation, ChatFilterCounts, ChatFilterTab } from '@/types/chatTypes';
import { ConversationListItem } from './ConversationListItem';

const FILTER_TABS: { id: ChatFilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ai', label: 'AI handling' },
  { id: 'human', label: 'Needs human' },
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
  className?: string;
}) {
  return (
    <aside
      className={`${className} w-full md:w-80 lg:w-96 shrink-0 flex-col border-r border-outline-variant/30 bg-surface-container-low`}
    >
      <div className="px-4 pt-4 pb-3 space-y-3 border-b border-outline-variant/30">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight text-on-surface">Chats</h1>
          <span className="text-xs text-on-surface-variant">{counts.all} conversations</span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search name, number or message"
            aria-label="Search conversations"
            className="w-full pl-9 pr-4 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex gap-1" role="tablist" aria-label="Filter conversations">
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
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                {tab.label}
                <span
                  className={`min-w-5 px-1 rounded-full text-[10px] ${active ? 'bg-on-primary/20' : 'bg-surface-container'}`}
                >
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <li className="p-8 text-center text-sm text-on-surface-variant">No conversations found.</li>
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
      </ul>
    </aside>
  );
}
