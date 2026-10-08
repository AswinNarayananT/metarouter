import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from '@/pages/Home';
import { Register } from '@/pages/Register';
import { Login } from '@/pages/Login';
import { SuperAdminLogin } from '@/pages/SuperAdminLogin';
import { ProtectedAdminRoute } from '@/components/superadmin/ProtectedAdminRoute';
import { SuperAdminLayout } from '@/components/superadmin/SuperAdminLayout';
import { SuperAdminDashboard } from '@/pages/admin/Dashboard';
import { OrganizationListPage } from '@/pages/admin/Organizations';
import { CreateOrganizationPage } from '@/pages/admin/CreateOrganization';
import { OrganizationDetailPage } from '@/pages/admin/OrganizationDetail';

// Import Workspace Components
import { TenantLayout } from '@/pages/workspace/TenantLayout';
import { WorkspaceOverview } from '@/pages/workspace/WorkspaceOverview';
import { CustomerChats } from '@/pages/workspace/CustomerChats';
import { Broadcast } from '@/pages/workspace/Broadcast';
import { TeamMembers } from '@/pages/workspace/TeamMembers';
import { WorkspaceSettings } from '@/pages/workspace/WorkspaceSettings';

import { useAppSelector } from '@/store';

function SuperAdminLoginGate() {
  const token = useAppSelector((state) => state.superAdmin.token);
  if (token) return <Navigate to="/admin/dashboard" replace />;
  return <SuperAdminLogin />;
}

// Protected Route Guard for Workspace / Tenant Users
function ProtectedWorkspaceRoute({ children }: { children: React.ReactNode }) {
  const token = useAppSelector((state) => state.workspace.token) || localStorage.getItem('workspace_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />

        {/* Super Admin Routes */}
        <Route path="/admin/login" element={<SuperAdminLoginGate />} />
        <Route
          path="/admin"
          element={
            <ProtectedAdminRoute>
              <SuperAdminLayout />
            </ProtectedAdminRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<SuperAdminDashboard />} />
          <Route path="organizations" element={<OrganizationListPage />} />
          <Route path="organizations/new" element={<CreateOrganizationPage />} />
          <Route path="organizations/:id" element={<OrganizationDetailPage />} />
        </Route>

        {/* Tenant Workspace Dashboard Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedWorkspaceRoute>
              <TenantLayout />
            </ProtectedWorkspaceRoute>
          }
        >
          <Route index element={<WorkspaceOverview />} />
          <Route path="chats" element={<CustomerChats />} />
          <Route path="broadcast" element={<Broadcast />} />
          <Route path="members" element={<TeamMembers />} />
          <Route path="settings" element={<WorkspaceSettings />} />
        </Route>

        {/* Setup Route placeholder */}
        <Route
          path="/dashboard/setup"
          element={
            <div className="min-h-screen bg-surface flex items-center justify-center text-on-surface">
              <div className="text-center space-y-4 p-8 max-w-md bg-surface-container-lowest rounded-2xl shadow-xl shadow-surface-container/60 border border-outline-variant/30">
                <div className="size-16 mx-auto rounded-2xl bg-primary text-on-primary flex items-center justify-center text-3xl shadow-md">
                  🚀
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Setting up your workspace…</h1>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  Connecting to Meta Embedded Signup. This is where the WhatsApp gateway setup flow will live.
                </p>
              </div>
            </div>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;