import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, LayoutDashboard, LogOut, Plus, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/Button';
import { useAppDispatch, useAppSelector } from '@/store';
import { logoutSuperAdmin } from '@/store/superAdmin/superAdminSlice';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/organizations', label: 'Organizations', icon: Building2, end: false },
];

export function SuperAdminLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.superAdmin.user);

  function handleLogout() {
    dispatch(logoutSuperAdmin());
    navigate('/admin/login');
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body selection:bg-primary-fixed selection:text-on-primary-fixed">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-12 -left-12 w-96 h-96 bg-primary-fixed/30 rounded-full blur-3xl" />
        <div className="absolute top-1/4 -right-12 w-96 h-96 bg-surface-container-highest/60 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-secondary-fixed/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen">
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-surface-container-high bg-surface-container-lowest/80 backdrop-blur-md">
          <div className="px-5 py-6">
            <Link to="/admin/dashboard" className="inline-flex">
              <BrandLogo size="md" linkToHome={false} />
            </Link>
            <div className="mt-4 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-container-low text-primary text-[10px] font-bold uppercase tracking-wide border border-outline-variant/30">
              <ShieldCheck className="size-3" />
              Super Admin
            </div>
          </div>

          <nav className="flex-1 px-3 space-y-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-low',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-surface-container-high">
            <p className="text-xs font-semibold text-on-surface truncate">{user?.name || 'Super Admin'}</p>
            <p className="text-[11px] text-on-surface-variant truncate mb-3">{user?.email}</p>
            <Button variant="secondary" size="sm" className="w-full" onClick={handleLogout}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-20 bg-surface/90 backdrop-blur-md border-b border-surface-container-high">
            <div className="flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 h-16">
              <div className="lg:hidden">
                <Link to="/admin/dashboard" className="inline-flex">
                  <BrandLogo size="sm" linkToHome={false} />
                </Link>
              </div>
              <div className="hidden lg:block">
                <p className="text-sm font-semibold text-on-surface">Platform control</p>
                <p className="text-xs text-on-surface-variant">Manage tenant workspaces and admin credentials</p>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="primary"
                  size="sm"
                  className="glow-primary"
                  onClick={() => navigate('/admin/organizations/new')}
                >
                  <Plus className="size-4" />
                  New organization
                </Button>
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={handleLogout} aria-label="Sign out">
                  <LogOut className="size-4" />
                </Button>
              </div>
            </div>
            <nav className="lg:hidden flex gap-1 px-4 pb-3 overflow-x-auto">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    clsx(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border',
                      isActive
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30',
                    )
                  }
                >
                  <Icon className="size-3.5" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </header>

          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
