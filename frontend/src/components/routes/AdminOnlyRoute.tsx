import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppSelector } from '@/store';

export function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.workspace.user);
  const isAdmin = user?.role === 'admin';
  
  if (!isAdmin) {
    return <Navigate to="/dashboard/members" replace />;
  }
  
  return <>{children}</>;
}
