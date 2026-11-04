import { useEffect, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { TicketFilters, TicketGroupNode, TicketType } from '@/types/ticketTypes';

const selectClass =
  'w-full px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary cursor-pointer';

interface TicketFiltersMenuProps {
  type: TicketType | '';
  groupId: number | null;
  activeCount: number;
  groups: TicketGroupNode[];
  onChange: (filters: Partial<TicketFilters>) => void;
}

/** "Filters" button: what the ticket is about (type and group). Changes apply straight away. */
export function TicketFiltersMenu({ type, groupId, activeCount, groups, onChange }: TicketFiltersMenuProps) {
  const [open, setOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 h-9.5 px-3 rounded-xl border text-sm cursor-pointer transition-colors ${
          activeCount > 0 ? 'bg-primary/10 border-primary/20 text-primary font-medium' : 'bg-surface border-outline/30 text-on-surface hover:border-primary'
        }`}
      >
        <SlidersHorizontal className="w-4 h-4 shrink-0" />
        <span>Filters</span>
        {activeCount > 0 && <span className="min-w-5 px-1 rounded-full bg-primary text-on-primary text-[11px] text-center">{activeCount}</span>}
        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-30 w-72 space-y-3 rounded-xl border border-outline-variant/50 bg-surface-container-lowest shadow-xl p-4">
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-on-surface">Type</span>
              <select value={type} onChange={(e) => onChange({ type: e.target.value as TicketType | '' })} className={selectClass}>
                <option value="">All types</option>
                <option value="enquiry">Enquiry</option>
                <option value="problem">Problem</option>
                <option value="complaint">Complaint</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-on-surface">Group</span>
              <select value={groupId ?? ''} onChange={(e) => onChange({ groupId: e.target.value ? Number(e.target.value) : null, subgroupId: null })} className={selectClass}>
                <option value="">All groups</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.ticket_count})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
