import { useEffect, useState } from 'react';
import { Check, ChevronDown, Users, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchTeamMembers } from '@/store/workspace/workspaceThunks';

/** "Member" button: lists the team; picking someone shows only the tickets assigned to them. */
export function TicketMemberFilter({ memberId, onChange }: { memberId: number | null; onChange: (memberId: number | null) => void }) {
  const dispatch = useAppDispatch();
  const members = useAppSelector((state) => state.workspace.teamMembers);
  const [open, setOpen] = useState(false);

  // The team list is shared with other pages; load it if nothing has yet
  useEffect(() => {
    if (members.length === 0) dispatch(fetchTeamMembers());
  }, [dispatch, members.length]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const activeMembers = members.filter((m) => m.is_active).sort((a, b) => a.name.localeCompare(b.name));
  const selected = members.find((m) => m.id === memberId);

  const pick = (id: number | null) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className="relative">
      {selected ? (
        <span className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1.5 rounded-xl bg-primary/10 text-primary text-sm font-medium">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1.5 cursor-pointer">
            <Users className="w-4 h-4" /> {selected.name}
          </button>
          <button type="button" onClick={() => pick(null)} aria-label="Show every member's tickets" className="p-0.5 rounded-full hover:bg-primary/15 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface hover:border-primary cursor-pointer"
        >
          <Users className="w-4 h-4 text-on-surface-variant" /> Member <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant" />
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <ul role="listbox" aria-label="Team members" className="absolute right-0 sm:left-0 sm:right-auto top-full mt-1 z-30 w-64 max-h-80 overflow-y-auto rounded-xl border border-outline-variant/50 bg-surface-container-lowest shadow-xl py-1">
            <li>
              <button type="button" role="option" aria-selected={memberId === null} onClick={() => pick(null)} className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-container cursor-pointer">
                All members {memberId === null && <Check className="w-4 h-4 text-primary" />}
              </button>
            </li>
            {activeMembers.map((member) => (
              <li key={member.id}>
                <button type="button" role="option" aria-selected={member.id === memberId} onClick={() => pick(member.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-container cursor-pointer">
                  <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                    {member.name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-on-surface truncate">{member.name}</span>
                    <span className="block text-xs text-on-surface-variant capitalize">{member.role}</span>
                  </span>
                  {member.id === memberId && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              </li>
            ))}
            {activeMembers.length === 0 && <li className="px-3 py-2 text-xs text-on-surface-variant">Loading members…</li>}
          </ul>
        </>
      )}
    </div>
  );
}
