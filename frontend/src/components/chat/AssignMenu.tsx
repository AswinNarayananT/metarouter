import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, UserMinus, UserPlus, UserRound } from 'lucide-react';
import type { ChatConversation } from '@/types/chatTypes';
import type { TeamMember } from '@/types/workspaceTypes';

/**
 * Who owns the chat. Admins / managers pick any member from a dropdown;
 * everyone else can take an unassigned chat (if their role may) or let go of their own.
 */
export function AssignMenu({
  conversation,
  members,
  currentUserId,
  isSupervisor,
  canPickUp,
  busy,
  onAssign,
}: {
  conversation: ChatConversation;
  members: TeamMember[];
  currentUserId: number | null;
  isSupervisor: boolean;
  canPickUp: boolean; // Role allowed to take unassigned chats (AI settings "allowed roles for handover")
  busy: boolean;
  onAssign: (userId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const owner = conversation.assignedTo;
  const isMine = owner !== null && owner.id === currentUserId;

  // Close on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = owner ? (isMine ? 'Assigned to you' : owner.name.split(' ')[0]) : 'Assign';
  const pick = (userId: number | null) => {
    setOpen(false);
    if (userId !== (owner?.id ?? null)) onAssign(userId);
  };

  // Members: take a free chat / release your own; someone else's chat just shows the owner
  if (!isSupervisor) {
    if (owner && !isMine) {
      return (
        <span className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs text-on-surface-variant">
          <UserRound className="w-4 h-4" /> {owner.name}
        </span>
      );
    }
    // Unassigned, and this role can't pick chats up: nothing to offer (an admin or manager assigns it)
    if (!owner && !canPickUp) return null;
    return (
      <button
        type="button"
        onClick={() => onAssign(isMine ? null : currentUserId)}
        disabled={busy || currentUserId === null}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-surface-container text-on-surface hover:bg-surface-container-high disabled:opacity-60 transition-colors cursor-pointer"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : isMine ? <UserMinus className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
        <span className="hidden sm:inline">{isMine ? 'Unassign me' : 'Assign to me'}</span>
      </button>
    );
  }

  // Supervisors: dropdown of active members
  const activeMembers = members.filter((m) => m.is_active);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-surface-container text-on-surface hover:bg-surface-container-high disabled:opacity-60 transition-colors cursor-pointer"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserRound className="w-4 h-4" />}
        <span className="hidden sm:inline max-w-28 truncate">{label}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-60 max-h-80 overflow-y-auto z-40 p-1 rounded-xl bg-surface-container-low border border-outline-variant/40 shadow-lg"
        >
          {currentUserId !== null && !isMine && (
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(currentUserId)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-primary font-medium hover:bg-surface-container cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Assign to me
            </button>
          )}
          <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            {owner ? 'Reassign to' : 'Assign to'}
          </p>
          {activeMembers.length === 0 && <p className="px-3 py-2 text-xs text-on-surface-variant">Loading members…</p>}
          {activeMembers.map((member) => (
            <button
              key={member.id}
              type="button"
              role="menuitem"
              onClick={() => pick(member.id)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left hover:bg-surface-container cursor-pointer"
            >
              <span className="min-w-0">
                <span className="block text-sm text-on-surface truncate">
                  {member.name}
                  {member.id === currentUserId && ' (you)'}
                </span>
                <span className="block text-[11px] text-on-surface-variant capitalize">{member.role}</span>
              </span>
              {owner?.id === member.id && <Check className="w-4 h-4 text-primary shrink-0" />}
            </button>
          ))}
          {owner && (
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(null)}
              className="w-full flex items-center gap-2 mt-1 px-3 py-2 rounded-lg text-sm text-on-surface-variant border-t border-outline-variant/30 hover:bg-surface-container cursor-pointer"
            >
              <UserMinus className="w-4 h-4" /> Unassign
            </button>
          )}
        </div>
      )}
    </div>
  );
}
