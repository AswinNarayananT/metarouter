import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Zap } from 'lucide-react';
import type { QuickReply } from '@/types/quickReplyTypes';

/**
 * Popover above the reply box listing saved replies. The composer owns the filtering and keyboard
 * (typing "/ref" in the box); opened from the ⚡ button it shows its own search field.
 */
export function QuickReplyPicker({
  replies,
  activeIndex,
  onActiveIndexChange,
  onPick,
  onClose,
  emptyText,
  search,
}: {
  replies: QuickReply[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onPick: (reply: QuickReply) => void;
  onClose: () => void;
  emptyText: string;
  search?: { value: string; onChange: (value: string) => void; onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Close on a click outside (Escape is handled by whichever field has the keyboard)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [onClose]);

  // Keep the highlighted reply in view while moving with the arrow keys
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Quick replies"
      className="absolute bottom-full left-0 right-0 mb-2 max-w-md rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl z-30 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-outline-variant/30">
        <Zap className="w-4 h-4 text-primary shrink-0" />
        {search ? (
          <div className="flex-1 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-on-surface-variant" />
            <input
              autoFocus
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              onKeyDown={search.onKeyDown}
              placeholder="Search quick replies"
              aria-label="Search quick replies"
              className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
            />
          </div>
        ) : (
          <span className="flex-1 text-xs font-semibold text-on-surface-variant">Quick replies · ↑↓ to choose, Enter to insert</span>
        )}
      </div>

      {replies.length === 0 ? (
        <p className="px-4 py-5 text-sm text-on-surface-variant text-center">{emptyText}</p>
      ) : (
        <ul ref={listRef} role="listbox" aria-label="Quick replies" className="max-h-64 overflow-y-auto py-1">
          {replies.map((reply, index) => (
            <li key={reply.id} role="option" aria-selected={index === activeIndex} data-index={index}>
              <button
                type="button"
                // mousedown, not click: the reply box keeps its focus and cursor position
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(reply);
                }}
                onMouseEnter={() => onActiveIndexChange(index)}
                className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 cursor-pointer ${
                  index === activeIndex ? 'bg-primary/10' : 'hover:bg-surface-container'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-primary">/{reply.shortcut}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      reply.scope === 'shared' ? 'bg-surface-container text-on-surface-variant' : 'bg-amber-500/10 text-amber-600'
                    }`}
                  >
                    {reply.scope === 'shared' ? 'Team' : 'Mine'}
                  </span>
                </span>
                <span className="text-xs text-on-surface-variant truncate">{reply.content}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="px-3 py-2 border-t border-outline-variant/30 text-right">
        <Link to="/dashboard/settings?tab=quick-replies" className="text-[11px] font-semibold text-primary hover:underline">
          Manage quick replies
        </Link>
      </div>
    </div>
  );
}
