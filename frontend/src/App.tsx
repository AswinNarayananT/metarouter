import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppSelector } from '@/store';

// Public & Landing Pages
import { Home } from '@/pages/Home';
import { Login } from '@/pages/Login';
import { AcceptInvitation } from '@/pages/workspace/AcceptInvitation';
import { WorkspaceOnboarding } from '@/pages/auth/WorkspaceOnboarding';

// Super Admin Pages & Components
import { SuperAdminLogin } from '@/pages/SuperAdminLogin';
import { ProtectedSuperAdminRoute } from '@/components/superAdmin/ProtectedSuperAdminRoute';
import { SuperAdminLayout } from '@/components/superAdmin/SuperAdminLayout';
import { SuperAdminDashboard } from '@/pages/superAdmin/Dashboard';
import { OrganizationListPage } from '@/pages/superAdmin/Organizations';
import { CreateOrganizationPage } from '@/pages/superAdmin/CreateOrganization';
import { OrganizationDetailPage } from '@/pages/superAdmin/OrganizationDetail';
import { PlatformModulesPage } from '@/pages/superAdmin/PlatformModules';
import { AuditLogsPage } from '@/pages/superAdmin/AuditLogs';
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
import { Orders } from '@/pages/workspace/Orders';

// Route Guards
import { ProtectedWorkspaceRoute } from '@/components/routes/ProtectedWorkspaceRoute';
import { PublicOnlyRoute } from '@/components/routes/PublicOnlyRoute';
import { AdminOnlyRoute } from '@/components/routes/AdminOnlyRoute';
import { FeatureRoute } from '@/components/routes/FeatureRoute';
import { useFeatureFlags } from '@/hooks/useFeatureFlag';

// Pages to land on when the workspace has no Overview module, in order
const LANDING_PAGES = [
  { feature: 'customer_chats', path: '/dashboard/chats' },
  { feature: 'tickets', path: '/dashboard/tickets' },
  { feature: 'orders', path: '/dashboard/orders' },
  { feature: 'team_members', path: '/dashboard/members' },
  { feature: 'settings', path: '/dashboard/settings' },
];

function WorkspaceHome() {
  const features = useFeatureFlags();
  if (features.overview) return <WorkspaceOverview />;
  const landing = LANDING_PAGES.find((page) => features[page.feature]);
  return landing ? <Navigate to={landing.path} replace /> : <FeatureRoute feature="overview" featureTitle="Overview">{null}</FeatureRoute>;
}

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

        <Route
          path="/onboard"
          element={
            <PublicOnlyRoute>
              <WorkspaceOnboarding />
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
          <Route path="modules" element={<PlatformModulesPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
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
          <Route index element={<WorkspaceHome />} />
          <Route
            path="orders"
            element={
              <FeatureRoute feature="orders" featureTitle="Orders & Commerce">
                <Orders />
              </FeatureRoute>
            }
          />
          <Route
            path="chats"
            element={
              <FeatureRoute feature="customer_chats" featureTitle="Customer Chats">
                <CustomerChats />
              </FeatureRoute>
            }
          />
          <Route
            path="tickets"
            element={
              <FeatureRoute feature="tickets" featureTitle="Tickets">
                <Tickets />
              </FeatureRoute>
            }
          />
          <Route
            path="broadcast"
            element={
              <AdminOnlyRoute>
                <FeatureRoute feature="broadcasts" featureTitle="Broadcast Campaigns">
                  <Broadcasts />
                </FeatureRoute>
              </AdminOnlyRoute>
            }
          />
          <Route
            path="broadcast/new"
            element={
              <AdminOnlyRoute>
                <FeatureRoute feature="broadcasts" featureTitle="New Broadcast">
                  <NewBroadcast />
                </FeatureRoute>
              </AdminOnlyRoute>
            }
          />
          <Route
            path="broadcast/:id"
            element={
              <AdminOnlyRoute>
                <FeatureRoute feature="broadcasts" featureTitle="Broadcast Details">
                  <BroadcastDetail />
                </FeatureRoute>
              </AdminOnlyRoute>
            }
          />
          <Route
            path="channels"
            element={
              <AdminOnlyRoute>
                <FeatureRoute feature="channels" featureTitle="Channels">
                  <Channels />
                </FeatureRoute>
              </AdminOnlyRoute>
            }
          />
          <Route
            path="members"
            element={
              <FeatureRoute feature="team_members" featureTitle="Team Members">
                <TeamMembers />
              </FeatureRoute>
            }
          />
          <Route
            path="invite"
            element={
              <AdminOnlyRoute>
                <FeatureRoute feature="invite_members" featureTitle="Invite Members">
                  <InviteMembers />
                </FeatureRoute>
              </AdminOnlyRoute>
            }
          />
          <Route
            path="ai-settings"
            element={
              <AdminOnlyRoute>
                <FeatureRoute feature="ai_assistant" featureTitle="AI Assistant">
                  <AISettings />
                </FeatureRoute>
              </AdminOnlyRoute>
            }
          />
          <Route
            path="settings"
            element={
              <FeatureRoute feature="settings" featureTitle="Workspace Settings">
                <WorkspaceSettings />
              </FeatureRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;