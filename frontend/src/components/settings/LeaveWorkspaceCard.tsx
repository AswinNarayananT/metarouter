import { useEffect, useState } from 'react';
import { Loader2, LogOut, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchMyOpenWork, leaveWorkspace } from '@/store/workspace/workspaceThunks';
import type { MemberOpenWork } from '@/types/workspaceTypes';

// Settings → Profile: the member leaves the workspace themselves (an admin can add them back later)
export function LeaveWorkspaceCard() {
  const user = useAppSelector((state) => state.workspace.user);
  const [open, setOpen] = useState(false);

  return (
    <section className="bg-surface-container-low border border-error/30 rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-error">Leave workspace</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            You'll lose access to {user?.organization_name ?? 'this workspace'} and be signed out. Your past messages
            and tickets stay.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-error/40 text-error text-sm font-medium hover:bg-error/10 transition-colors cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" />
          Leave workspace
        </button>
      </div>
      {open && <LeaveDialog workspaceName={user?.organization_name ?? 'this workspace'} onCancel={() => setOpen(false)} />}
    </section>
  );
}

function LeaveDialog({ workspaceName, onCancel }: { workspaceName: string; onCancel: () => void }) {
  const dispatch = useAppDispatch();
  const [openWork, setOpenWork] = useState<MemberOpenWork | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 1. What goes back to the unassigned queue
  useEffect(() => {
    dispatch(fetchMyOpenWork()).then((result) => {
      if (fetchMyOpenWork.fulfilled.match(result)) setOpenWork(result.payload);
    });
  }, [dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onCancel]);

  // 2. Leave; on success the thunk signs out and the route guard goes to the login page (a toast confirms it)
  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Enter your password to confirm');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await dispatch(leaveWorkspace(password));
    if (leaveWorkspace.rejected.match(result)) {
      setSaving(false);
      setError(result.payload as string);
    }
  };

  const workCount = openWork ? openWork.open_chats + openWork.open_tickets : 0;
  const plural = (n: number, word: string) => `${n} open ${word}${n === 1 ? '' : 's'}`;

  return (
    <div role="dialog" aria-modal="true" aria-label="Leave workspace" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !saving && onCancel()}>
      <form onSubmit={confirm} noValidate onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <LogOut className="w-4 h-4 text-error" /> Leave {workspaceName}?
          </h2>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Cancel" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm text-on-surface">
          <p>You'll be signed out everywhere and can't log in here again unless an admin adds you back.</p>

          {openWork && workCount > 0 && (
            <p className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800">
              You have {plural(openWork.open_chats, 'chat')} and {plural(openWork.open_tickets, 'ticket')}. They'll go back to
              the unassigned queue, and your admins will be told.
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="leave_password" className="block text-xs font-medium text-on-surface">
              Your password
            </label>
            <input
              id="leave_password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
              className={`w-full px-4 py-2.5 bg-surface border rounded-xl text-sm text-on-surface focus:outline-none ${
                error ? 'border-error focus:border-error' : 'border-outline/30 focus:border-primary'
              }`}
            />
            {error && <p className="text-xs text-error">{error}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30">
          <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-xl text-sm text-on-surface hover:bg-surface-container cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-error text-on-error text-sm font-medium hover:bg-error/90 disabled:opacity-50 cursor-pointer"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Leave workspace
          </button>
        </div>
      </form>
    </div>
  );
}
