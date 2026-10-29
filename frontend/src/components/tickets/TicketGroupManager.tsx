import { useState } from 'react';
import { Check, GitMerge, Loader2, Pencil, X } from 'lucide-react';
import { api } from '@/api/axios';
import { notifyError, notifySuccess } from '@/utils/notify';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchTicketGroups, fetchTickets } from '@/store/tickets/ticketThunks';
import type { TicketGroupNode } from '@/types/ticketTypes';

type Editing = { id: number; mode: 'rename' | 'merge'; value: string } | null;

/** Admins / managers tidy the AI-built list: rename, or merge near-duplicates (their tickets move together). */
export function TicketGroupManager() {
  const dispatch = useAppDispatch();
  const groups = useAppSelector((state) => state.tickets.groups);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);

  const allSubgroups = groups.flatMap((g) => g.subgroups.map((sg) => ({ ...sg, groupName: g.name })));

  const save = async () => {
    if (!editing || !editing.value) return;
    setBusy(true);
    try {
      if (editing.mode === 'rename') {
        await api.patch(`/api/v1/tickets/groups/${editing.id}`, { name: editing.value.trim() });
        notifySuccess(`Renamed to "${editing.value.trim()}"`);
      } else {
        await api.post(`/api/v1/tickets/groups/${editing.id}/merge`, { into_id: Number(editing.value) });
        notifySuccess('Merged. Its tickets moved over.');
      }
      setEditing(null);
      dispatch(fetchTicketGroups());
      dispatch(fetchTickets({ page: 1 })); // Moved tickets show their new labels
    } catch (err) {
      notifyError(err, editing.mode === 'rename' ? 'Failed to rename' : 'Failed to merge');
    } finally {
      setBusy(false);
    }
  };

  const row = (item: { id: number; name: string; ticket_count: number }, mergeOptions: { id: number; label: string }[], isSubgroup: boolean) => {
    const active = editing?.id === item.id;
    return (
      <div className={`flex flex-wrap items-center gap-2 py-2 ${isSubgroup ? 'pl-6' : ''}`}>
        {active && editing.mode === 'rename' ? (
          <input
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            maxLength={120}
            autoFocus
            aria-label="New name"
            className="flex-1 min-w-40 px-2 py-1 bg-surface border border-outline/30 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary"
          />
        ) : (
          <span className={`flex-1 min-w-40 text-sm ${isSubgroup ? 'text-on-surface' : 'font-semibold text-on-surface'}`}>
            {item.name} <span className="text-xs font-normal text-on-surface-variant">· {item.ticket_count} tickets</span>
          </span>
        )}

        {active && editing.mode === 'merge' && (
          <select
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            aria-label="Merge into"
            className="px-2 py-1 bg-surface border border-outline/30 rounded-lg text-sm text-on-surface"
          >
            <option value="">Merge into…</option>
            {mergeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        {active ? (
          <>
            <button type="button" onClick={save} disabled={busy || !editing.value} aria-label="Save" className="p-1.5 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-50 cursor-pointer">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing({ id: item.id, mode: 'rename', value: item.name })}
              aria-label={`Rename ${item.name}`}
              className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditing({ id: item.id, mode: 'merge', value: '' })}
              disabled={mergeOptions.length === 0}
              aria-label={`Merge ${item.name}`}
              title="Merge into another one (its tickets move there)"
              className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-40 cursor-pointer"
            >
              <GitMerge className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-on-surface">Groups and subgroups</h3>
        <p className="text-xs text-on-surface-variant">
          The AI builds this list and reuses it for new tickets. Merge near-duplicates ("Receipt missing" into "Receipt not received") so repeated problems count together.
        </p>
      </div>
      {groups.length === 0 && <p className="py-6 text-center text-sm text-on-surface-variant">No groups yet. They appear as the AI files tickets.</p>}
      <div className="divide-y divide-outline-variant/20">
        {groups.map((group: TicketGroupNode) => (
          <div key={group.id}>
            {row(
              group,
              groups.filter((g) => g.id !== group.id).map((g) => ({ id: g.id, label: g.name })),
              false
            )}
            {group.subgroups.map((subgroup) => (
              <div key={subgroup.id}>
                {row(
                  subgroup,
                  allSubgroups.filter((sg) => sg.id !== subgroup.id).map((sg) => ({ id: sg.id, label: `${sg.groupName} › ${sg.name}` })),
                  true
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
