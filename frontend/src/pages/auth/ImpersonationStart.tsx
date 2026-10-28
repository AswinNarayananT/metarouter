import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import { useAppDispatch } from '@/store';
import { startImpersonation } from '@/store/workspace/workspaceSlice';
import type { WorkspaceUser } from '@/types/workspaceTypes';

// Read once, before the hash is cleared (StrictMode renders twice)
function readCodeFromHash(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('code') || '';
}

// Opened by the super admin panel's "Log in as user": redeems the one-time code for a read-only support session
export function ImpersonationStart() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [code] = useState(readCodeFromHash);
  const [error, setError] = useState<string | null>(null);
  const redeemed = useRef(false);

  const ended = new URLSearchParams(window.location.search).get('ended') === '1';

  useEffect(() => {
    if (!code || redeemed.current) return;
    redeemed.current = true;

    // Keep the code out of the address bar and history
    window.history.replaceState(null, '', '/impersonate');

    api
      .post<{ access_token: string; user: WorkspaceUser }>('/api/v1/auth/impersonate/exchange', { code })
      .then((response) => {
        dispatch(startImpersonation(response.data));
        navigate('/dashboard', { replace: true });
      })
      .catch((err) => setError(getApiErrorMessage(err, 'Could not start the support session')));
  }, [code, dispatch, navigate]);

  const isWorking = Boolean(code) && !error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <Card className="w-full max-w-md p-8 text-center space-y-4">
        <div className="mx-auto size-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
          {error ? <AlertCircle className="size-6" /> : <Eye className="size-6" />}
        </div>

        {isWorking ? (
          <>
            <h1 className="text-lg font-bold text-on-surface">Starting support session…</h1>
            <div className="mx-auto size-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-on-surface">
              {error ? 'Support session not started' : ended ? 'Support session ended' : 'No support session'}
            </h1>
            <p className="text-sm text-on-surface-variant">
              {error || 'Start a new session from the organization page in the super admin panel. You can close this tab.'}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
