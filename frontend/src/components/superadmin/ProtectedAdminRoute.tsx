import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/store';

export function ProtectedAdminRoute({ children }: { children: ReactNode }) {
  const token = useAppSelector((state) => state.superAdmin.token);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
