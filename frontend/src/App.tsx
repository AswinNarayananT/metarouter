import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppSelector } from '@/store';

// Public & Landing Pages
import { Home } from '@/pages/Home';
import { Login } from '@/pages/Login';
import { AcceptInvitation } from '@/pages/workspace/AcceptInvitation';

// Super Admin Pages & Components
import { SuperAdminLogin } from '@/pages/SuperAdminLogin';
import { ProtectedSuperAdminRoute } from '@/components/superadmin/ProtectedSuperAdminRoute';
import { SuperAdminLayout } from '@/components/superadmin/SuperAdminLayout';
import { SuperAdminDashboard } from '@/pages/admin/Dashboard';
import { OrganizationListPage } from '@/pages/admin/Organizations';
import { CreateOrganizationPage } from '@/pages/admin/CreateOrganization';
import { OrganizationDetailPage } from '@/pages/admin/OrganizationDetail';

// Tenant Workspace Pages & Layout
import { TenantLayout } from '@/pages/workspace/TenantLayout';
import { WorkspaceOverview } from '@/pages/workspace/WorkspaceOverview';
import { CustomerChats } from '@/pages/workspace/CustomerChats';
import { Broadcast } from '@/pages/workspace/Broadcast';
import { TeamMembers } from '@/pages/workspace/TeamMembers';
import { InviteMembers } from '@/pages/workspace/InviteMembers';
import { WorkspaceSettings } from '@/pages/workspace/WorkspaceSettings';

// Route Guards
import { ProtectedWorkspaceRoute } from '@/components/routes/protectedRoute';
import { PublicOnlyRoute } from '@/components/routes/publicRoute';
import { AdminOnlyRoute } from '@/components/routes/adminOnlyRoute';

function SuperAdminLoginGate() {
  const user = useAppSelector((state) => state.superAdmin.user);
  if (user) return <Navigate to="/admin/dashboard" replace />;
  return <SuperAdminLogin />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ========================================== */}
        {/* Public & Authentication Routes             */}
        {/* ========================================== */}
        <Route path="/" element={<Home />} />
        
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <AcceptInvitation />
            </PublicOnlyRoute>
          }
        />

        {/* ========================================== */}
        {/* Super Admin Portal Routes                  */}
        {/* ========================================== */}
        <Route path="/admin/login" element={<SuperAdminLoginGate />} />
        
        <Route
          path="/admin"
          element={
            <ProtectedSuperAdminRoute>
              <SuperAdminLayout />
            </ProtectedSuperAdminRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<SuperAdminDashboard />} />
          <Route path="organizations" element={<OrganizationListPage />} />
          <Route path="organizations/new" element={<CreateOrganizationPage />} />
          <Route path="organizations/:id" element={<OrganizationDetailPage />} />
        </Route>

        {/* ========================================== */}
        {/* Tenant Workspace Dashboard Routes          */}
        {/* ========================================== */}
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
          <Route
            path="invite"
            element={
              <AdminOnlyRoute>
                <InviteMembers />
              </AdminOnlyRoute>
            }
          />
          <Route path="settings" element={<WorkspaceSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;