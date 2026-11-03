import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Building2, LayoutDashboard, LogOut, Plus, ShieldCheck, Settings, ScrollText, Blocks } from 'lucide-react';
import { clsx } from 'clsx';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Button } from '@/components/ui/Button';
import { useAppDispatch, useAppSelector } from '@/store';
import { logoutSuperAdminSession } from '@/store/superAdmin/superAdminThunks';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/organizations', label: 'Organizations', icon: Building2, end: false },
  { to: '/admin/modules', label: 'Modules', icon: Blocks, end: true },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText, end: true },
  { to: '/admin/settings', label: 'Settings', icon: Settings, end: true },
];

export function SuperAdminLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.superAdmin.user);
  const { pathname } = useLocation();

  // Shown in the header; pages don't repeat their own title
  const pageName =
    pathname === '/admin/organizations/new'
      ? 'New organization'
      : NAV.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)))?.label ?? 'Dashboard';

  async function handleLogout() {
    await dispatch(logoutSuperAdminSession());
    navigate('/admin/login');
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body selection:bg-primary-fixed selection:text-on-primary-fixed">
      <div className="flex min-h-screen">
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border-subtle bg-surface-container-lowest">
          <div className="px-5 py-6">
            <Link to="/admin/dashboard" className="inline-flex">
              <BrandLogo size="md" linkToHome={false} />
            </Link>
            <div className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-fixed text-on-primary-fixed text-xs font-semibold">
              <ShieldCheck className="size-3.5" />
              Super admin
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
                    'flex items-center gap-3 px-4 py-2.5 rounded-full text-sm transition-colors',
                    isActive
                      ? 'bg-primary-fixed text-on-primary-fixed font-semibold'
                      : 'font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
                  )
                }
              >
                <Icon className="size-[18px]" strokeWidth={1.75} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-border-subtle">
            <p className="text-xs font-semibold text-on-surface truncate">{user?.name || 'Super Admin'}</p>
            <p className="text-[11px] text-on-surface-variant truncate mb-3">{user?.email}</p>
            <Button variant="secondary" size="sm" className="w-full" onClick={handleLogout}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-20 bg-header text-on-header border-b border-border-subtle">
            <div className="flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 h-16">
              <div className="flex items-center gap-3 min-w-0">
                <Link to="/admin/dashboard" className="inline-flex lg:hidden">
                  <BrandLogo size="sm" linkToHome={false} />
                </Link>
                <p className="text-lg font-semibold text-on-header truncate">{pageName}</p>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="primary"
                  size="sm"
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
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap',
                      isActive
                        ? 'bg-primary-fixed text-on-primary-fixed'
                        : 'bg-surface-container text-on-surface-variant',
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