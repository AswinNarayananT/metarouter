import { useEffect, useState } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Users,
  UserPlus,
  Bot,
  Cable,
  Settings,
  LogOut,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Route,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { logoutWorkspace } from '@/store/workspace/workspaceSlice';

export function TenantLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // User comes from the Redux store (organization_name lives on the user)
  const user = useAppSelector((state) => state.workspace.user);
  const isAdmin = user?.role === 'admin';

  // Desktop: collapse to icon rail. Mobile: slide-over drawer.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    dispatch(logoutWorkspace());
    navigate('/login');
  };

  const navItems = [
    { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
    ...(isAdmin
      ? [
          { label: 'Channels', path: '/dashboard/channels', icon: Cable },
          { label: 'AI Assistant', path: '/dashboard/ai-settings', icon: Bot },
        ]
      : []),
    { label: 'Customer Chats', path: '/dashboard/chats', icon: MessageSquare },
    ...(isAdmin ? [{ label: 'Broadcast', path: '/dashboard/broadcast', icon: Send }] : []),
    { label: 'Team Members', path: '/dashboard/members', icon: Users },
    ...(isAdmin ? [{ label: 'Invite Members', path: '/dashboard/invite', icon: UserPlus }] : []),
    { label: 'Settings', path: '/dashboard/settings', icon: Settings },
  ];

  const isItemActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname === '/dashboard'
      : location.pathname.startsWith(path);

  const currentPage = navItems.find((i) => isItemActive(i.path))?.label ?? 'Overview';

  const orgName: string = user?.organization_name || 'Workspace';
  const userName: string = user?.name || '';
  const initials = (userName || orgName)
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // `showLabels` is false only on the desktop collapsed rail
  const renderSidebarContent = (showLabels: boolean) => (
    <>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              title={!showLabels ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center rounded-xl text-sm font-medium transition-all ${
                showLabels ? 'gap-3 px-4 py-3' : 'justify-center px-0 py-3'
              } ${
                active
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {showLabels && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-outline-variant/30">
        <button
          onClick={handleLogout}
          title={!showLabels ? 'Sign Out' : undefined}
          className={`w-full flex items-center rounded-xl text-sm font-medium text-error hover:bg-error-container/20 transition-all ${
            showLabels ? 'gap-3 px-4 py-3' : 'justify-center px-0 py-3'
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {showLabels && <span>Sign Out</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="h-screen bg-surface text-on-surface flex flex-col overflow-hidden">
      {/* Top Navbar */}
      <header className="h-16 shrink-0 bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between px-4 sm:px-6 z-30">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile drawer toggle */}
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="lg:hidden p-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop collapse toggle */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:inline-flex p-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen className="w-5 h-5" />
            ) : (
              <PanelLeftClose className="w-5 h-5" />
            )}
          </button>

          {/* Brand */}
          <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center shrink-0">
              <Route className="w-4 h-4" />
            </span>
            <span className="font-bold text-base tracking-tight text-on-surface">
              MetaRouter
            </span>
          </Link>

          {/* Breadcrumb / current page */}
          <div className="hidden md:flex items-center gap-3 ml-3 pl-4 border-l border-outline-variant/30 min-w-0">
            <span className="text-sm text-on-surface-variant truncate">{currentPage}</span>
          </div>
        </div>

        {/* Workspace / user info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:block text-right min-w-0">
            <p className="text-sm font-semibold text-on-surface truncate max-w-[220px]">
              {userName || orgName}
            </p>
            <p className="text-xs text-on-surface-variant truncate max-w-[220px]">
              {userName ? `${orgName} · ` : ''}
              <span className="capitalize">{user?.role}</span>
            </p>
          </div>
          <div
            className="w-9 h-9 rounded-full bg-surface-container text-on-surface border border-outline-variant/40 flex items-center justify-center text-xs font-semibold shrink-0"
            aria-hidden="true"
          >
            {initials || 'W'}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar (collapsible) */}
        <aside
          className={`hidden lg:flex flex-col shrink-0 bg-surface-container-low border-r border-outline-variant/30 transition-[width] duration-200 ease-in-out ${
            collapsed ? 'w-[72px]' : 'w-64'
          }`}
        >
          {renderSidebarContent(!collapsed)}
        </aside>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <aside className="relative w-64 max-w-[80%] bg-surface-container-low border-r border-outline-variant/30 flex flex-col shadow-xl">
              <div className="h-16 px-4 flex items-center justify-between border-b border-outline-variant/30">
                <span className="font-bold text-base tracking-tight">MetaRouter</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {renderSidebarContent(true)}
            </aside>
          </div>
        )}

        {/* Main Dynamic Workspace Area */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-surface">
          <Outlet />
        </main>
      </div>
    </div>
  );
}