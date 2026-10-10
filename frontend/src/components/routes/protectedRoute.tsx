import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/store';
import { fetchCurrentUser } from '@/store/workspace/workspaceThunks';

export function ProtectedWorkspaceRoute({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.workspace.user);
  const token = useAppSelector((state) => state.workspace.token);
  const isLoading = useAppSelector((state) => state.workspace.isLoading);

  useEffect(() => {
    if (token && !user) {
      dispatch(fetchCurrentUser());
    }
  }, [token, user, dispatch]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}