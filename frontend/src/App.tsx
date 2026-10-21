import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppSelector } from '@/store';

// Public & Landing Pages
import { Home } from '@/pages/Home';
import { Login } from '@/pages/Login';
import { AcceptInvitation } from '@/pages/workspace/AcceptInvitation';

// Super Admin Pages & Components
import { SuperAdminLogin } from '@/pages/SuperAdminLogin';
import { ProtectedSuperAdminRoute } from '@/components/superAdmin/ProtectedSuperAdminRoute';
import { SuperAdminLayout } from '@/components/superAdmin/SuperAdminLayout';
import { SuperAdminDashboard } from '@/pages/superAdmin/Dashboard';
import { OrganizationListPage } from '@/pages/superAdmin/Organizations';
import { CreateOrganizationPage } from '@/pages/superAdmin/CreateOrganization';
import { OrganizationDetailPage } from '@/pages/superAdmin/OrganizationDetail';
import { SuperAdminSettings } from '@/pages/superAdmin/SuperAdminSettings';

// Workspace Pages & Layout
import { WorkspaceLayout } from '@/pages/workspace/WorkspaceLayout';
import { WorkspaceOverview } from '@/pages/workspace/WorkspaceOverview';
import { CustomerChats } from '@/pages/workspace/CustomerChats';
import { Tickets } from '@/pages/workspace/Tickets';
import { Broadcasts } from '@/pages/workspace/Broadcasts';
import { NewBroadcast } from '@/pages/workspace/NewBroadcast';
import { BroadcastDetail } from '@/pages/workspace/BroadcastDetail';
import { TeamMembers } from '@/pages/workspace/TeamMembers';
import { InviteMembers } from '@/pages/workspace/InviteMembers';
import { WorkspaceSettings } from '@/pages/workspace/WorkspaceSettings';
import { AISettings } from '@/pages/workspace/AISettings';
import { Channels } from '@/pages/workspace/Channels';

// Route Guards
import { ProtectedWorkspaceRoute } from '@/components/routes/ProtectedWorkspaceRoute';
import { PublicOnlyRoute } from '@/components/routes/PublicOnlyRoute';
import { AdminOnlyRoute } from '@/components/routes/AdminOnlyRoute';

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
          <Route path="settings" element={<SuperAdminSettings />} />
        </Route>

        {/* ========================================== */}
        {/* Workspace Dashboard Routes                 */}
        {/* ========================================== */}
        <Route
          path="/dashboard"
          element={
            <ProtectedWorkspaceRoute>
              <WorkspaceLayout />
            </ProtectedWorkspaceRoute>
          }
        >
          <Route index element={<WorkspaceOverview />} />
          <Route path="chats" element={<CustomerChats />} />
          <Route path="tickets" element={<Tickets />} />
          <Route
            path="broadcast"
            element={
              <AdminOnlyRoute>
                <Broadcasts />
              </AdminOnlyRoute>
            }
          />
          <Route
            path="broadcast/new"
            element={
              <AdminOnlyRoute>
                <NewBroadcast />
              </AdminOnlyRoute>
            }
          />
          <Route
            path="broadcast/:id"
            element={
              <AdminOnlyRoute>
                <BroadcastDetail />
              </AdminOnlyRoute>
            }
          />
          <Route
            path="channels"
            element={
              <AdminOnlyRoute>
                <Channels />
              </AdminOnlyRoute>
            }
          />
          <Route path="members" element={<TeamMembers />} />
          <Route
            path="invite"
            element={
              <AdminOnlyRoute>
                <InviteMembers />
              </AdminOnlyRoute>
            }
          />
          <Route
            path="ai-settings"
            element={
              <AdminOnlyRoute>
                <AISettings />
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