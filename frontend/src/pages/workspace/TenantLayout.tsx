    import React from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { MessageSquare, Send, Users, Settings, LogOut, LayoutDashboard } from 'lucide-react';
import { useAppDispatch } from '@/store';
import { logoutWorkspace } from '@/store/workspace/workspaceSlice';

export function TenantLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const userProfile = JSON.parse(localStorage.getItem('workspace_user') || '{}');
  const isAdmin = userProfile.role === 'admin';

  const handleLogout = () => {
    dispatch(logoutWorkspace());
    navigate('/login');
  };

  const navItems = [
    { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Customer Chats', path: '/dashboard/chats', icon: MessageSquare },
    { label: 'Broadcast', path: '/dashboard/broadcast', icon: Send },
    ...(isAdmin ? [{ label: 'Team Members', path: '/dashboard/members', icon: Users }] : []),
    { label: 'Settings', path: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-surface text-on-surface flex">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-surface-container-low border-r border-outline-variant/30 flex flex-col">
        <div className="p-6 border-b border-outline-variant/30">
          <h2 className="font-bold text-sm tracking-tight text-on-surface truncate">
            {userProfile.organization_name || 'Workspace'}
          </h2>
          <p className="text-xs text-on-surface-variant capitalize mt-0.5">Role: {userProfile.role}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            // Exact match for index dashboard, partial for sub-paths
            const isActive = item.path === '/dashboard' 
              ? location.pathname === '/dashboard' 
              : location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary text-on-primary shadow-md'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-outline-variant/30">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-error hover:bg-error-container/20 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Dynamic Workspace Area */}
      <main className="flex-1 overflow-y-auto p-8 bg-surface">
        <Outlet />
      </main>
    </div>
  );
}