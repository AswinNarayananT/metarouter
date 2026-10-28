import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, LogOut } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { logoutWorkspaceSession } from '@/store/workspace/workspaceThunks';

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Shown on every workspace page while a super admin views it as this user (read-only, time-limited)
export function ImpersonationBanner() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.workspace.user);
  const impersonation = user?.impersonation;
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!impersonation) return;
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [impersonation]);

  const remaining = impersonation ? Math.max(0, impersonation.expires_at - now) : 0;

  const endSession = async () => {
    await dispatch(logoutWorkspaceSession());
    navigate('/impersonate?ended=1', { replace: true });
  };

  // Token expired: end here rather than waiting for the next request to fail
  useEffect(() => {
    if (impersonation && remaining === 0) endSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impersonation, remaining]);

  if (!impersonation || !user) return null;

  return (
    <div className="shrink-0 bg-amber-500 text-black px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs sm:text-sm font-medium z-40">
      <span className="flex items-center gap-2">
        <Eye className="size-4 shrink-0" />
        <span>
          Support session as <strong>{user.name}</strong> ({user.role}) · read-only · signed in as {impersonation.admin_email}
        </span>
      </span>
      <span className="font-mono tabular-nums">ends in {formatRemaining(remaining)}</span>
      <button
        type="button"
        onClick={endSession}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black/15 hover:bg-black/25 font-semibold transition-colors cursor-pointer"
      >
        <LogOut className="size-3.5" />
        End session
      </button>
    </div>
  );
}
