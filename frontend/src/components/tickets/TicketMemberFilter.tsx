import { useEffect, useState } from 'react';
import { Check, ChevronDown, Search, Users, UserX, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchTeamMembers } from '@/store/workspace/workspaceThunks';
import type { TicketMemberFilterValue } from '@/types/ticketTypes';

interface TicketMemberFilterProps {
  memberId: TicketMemberFilterValue;
  onChange: (memberId: TicketMemberFilterValue) => void;
}

/** "Member" filter: lists the team + unassigned; picking someone shows only their assigned tickets. */
export function TicketMemberFilter({ memberId, onChange }: TicketMemberFilterProps) {
  const dispatch = useAppDispatch();
  const members = useAppSelector((state) => state.workspace.teamMembers);
  const currentUser = useAppSelector((state) => state.workspace.user);
  const isLoading = useAppSelector((state) => state.workspace.isLoadingTeamMembers);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // The team list is shared with other pages; load it if nothing has yet
  useEffect(() => {
    if (members.length === 0) dispatch(fetchTeamMembers());
  }, [dispatch, members.length]);

  // Closing also clears the search
  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const toggle = () => (open ? close() : setOpen(true));

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const activeMembers = members.filter((m) => m.is_active).sort((a, b) => a.name.localeCompare(b.name));
  const isMember = typeof memberId === 'number';
  const selectedMember = isMember ? members.find((m) => m.id === memberId) : null;
  // A member removed from the team while selected is still the active filter: keep it visible so it can be cleared
  const selectedName = selectedMember?.name ?? (isLoading ? 'Loading…' : 'Former member');
  const isUnassigned = memberId === 'unassigned';

  const term = query.trim().toLowerCase();
  const filteredMembers = term
    ? activeMembers.filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          m.email.toLowerCase().includes(term) ||
          m.role.toLowerCase().includes(term)
      )
    : activeMembers;

  const pick = (id: TicketMemberFilterValue) => {
    onChange(id);
    close();
  };

  return (
    <div className="relative inline-block">
      {isUnassigned ? (
        <span className="inline-flex items-center gap-1.5 h-[38px] pl-3 pr-1.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm font-medium border border-amber-500/30">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
          >
            <UserX className="w-4 h-4 shrink-0" />
            <span>Unassigned</span>
          </button>
          <button
            type="button"
            onClick={() => pick(null)}
            aria-label="Clear member filter"
            className="p-1 rounded-full hover:bg-amber-500/20 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ) : isMember ? (
        <span className="inline-flex items-center gap-1.5 h-[38px] pl-3 pr-1.5 rounded-xl bg-primary/10 text-primary text-sm font-medium border border-primary/20">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 truncate max-w-[180px]"
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {selectedName}
              {memberId === currentUser?.id ? ' (you)' : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => pick(null)}
            aria-label="Show every member's tickets"
            className="p-1 rounded-full hover:bg-primary/20 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 h-[38px] px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface hover:border-primary cursor-pointer transition-colors"
        >
          <Users className="w-4 h-4 text-on-surface-variant shrink-0" />
          <span>Member</span>
          <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={close} />
          <div className="absolute right-0 sm:left-0 sm:right-auto top-full mt-1.5 z-30 w-72 max-h-96 flex flex-col rounded-xl border border-outline-variant/50 bg-surface-container-lowest shadow-xl py-1 overflow-hidden">
            {activeMembers.length > 4 && (
              <div className="p-2 border-b border-outline-variant/30">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant/60" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search team member…"
                    aria-label="Filter team members"
                    className="w-full pl-8 pr-3 py-1.5 bg-surface border border-outline/30 rounded-lg text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
              </div>
            )}

            <ul role="listbox" aria-label="Team members" className="flex-1 overflow-y-auto py-1">
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={memberId === null}
                  onClick={() => pick(null)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-on-surface-variant" />
                    <span>All members</span>
                  </span>
                  {memberId === null && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              </li>

              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={isUnassigned}
                  onClick={() => pick('unassigned')}
                  className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-container cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <UserX className="w-4 h-4 text-amber-600" />
                    <span>Unassigned</span>
                  </span>
                  {isUnassigned && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              </li>

              <li className="my-1 border-t border-outline-variant/30" />

              {filteredMembers.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={member.id === memberId}
                    onClick={() => pick(member.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-container cursor-pointer transition-colors"
                  >
                    <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                      {member.name.trim().charAt(0).toUpperCase() || '?'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-on-surface truncate">
                        {member.name}
                        {member.id === currentUser?.id && (
                          <span className="ml-1 text-xs text-primary font-medium">(you)</span>
                        )}
                      </span>
                      <span className="block text-xs text-on-surface-variant capitalize">{member.role}</span>
                    </span>
                    {member.id === memberId && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                </li>
              ))}

              {filteredMembers.length === 0 && activeMembers.length > 0 && (
                <li className="px-3 py-4 text-xs text-center text-on-surface-variant">
                  No team members matching "{query}"
                </li>
              )}

              {activeMembers.length === 0 && (
                <li className="px-3 py-4 text-xs text-center text-on-surface-variant">
                  {isLoading ? 'Loading members…' : 'No team members in workspace'}
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
