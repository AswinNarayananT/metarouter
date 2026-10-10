import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppSelector } from '@/store';

export function ProtectedSuperAdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.superAdmin.user);
  if (!user) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}
