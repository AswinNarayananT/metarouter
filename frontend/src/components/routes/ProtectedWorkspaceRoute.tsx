import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/store';
import { fetchCurrentUser } from '@/store/workspace/workspaceThunks';

export function ProtectedWorkspaceRoute({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.workspace.user);
  const token = useAppSelector((state) => state.workspace.token);

  useEffect(() => {
    if (token && !user) {
      dispatch(fetchCurrentUser());
    }
  }, [token, user, dispatch]);

  if (token && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs text-on-surface-variant font-medium">Validating workspace session...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}