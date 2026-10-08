import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, MessageSquare, Sparkles, Users } from 'lucide-react';
import { Card, Container } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchDashboardStats } from '@/store/superAdmin/organizationThunks';

const STAT_META = [
  { key: 'organization_count' as const, label: 'Organizations', icon: Building2 },
  { key: 'active_organization_count' as const, label: 'Active tenants', icon: Sparkles },
  { key: 'user_count' as const, label: 'Workspace users', icon: Users },
  { key: 'whatsapp_count' as const, label: 'WhatsApp numbers', icon: MessageSquare },
];

export function SuperAdminDashboard() {
  const dispatch = useAppDispatch();
  const { stats, isLoading, error } = useAppSelector((state) => state.organizations);
  const user = useAppSelector((state) => state.superAdmin.user);

  useEffect(() => {
    dispatch(fetchDashboardStats());
  }, [dispatch]);

  return (
    <Container>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-4 border border-outline-variant/30">
          <Sparkles className="size-3.5" />
          Super admin overview
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
          Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="mt-2 text-on-surface-variant max-w-2xl">
          Provision client workspaces, issue admin credentials, and keep every tenant isolated on the MetaRouter gateway.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl bg-error-container text-on-error-container text-sm px-4 py-3">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {STAT_META.map(({ key, label, icon: Icon }) => (
          <Card key={key} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-outline">{label}</p>
                <p className="mt-2 text-3xl font-extrabold text-primary">
                  {isLoading && !stats ? '—' : (stats?.[key] ?? 0)}
                </p>
              </div>
              <div className="size-10 rounded-xl bg-surface-container-low text-primary border border-outline-variant/30 flex items-center justify-center">
                <Icon className="size-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-on-surface">Recent organizations</h2>
        <Link to="/admin/organizations">
          <Button variant="ghost" size="sm">
            View all
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        {isLoading && !stats ? (
          <p className="p-6 text-sm text-on-surface-variant">Loading tenants…</p>
        ) : !stats?.recent_organizations.length ? (
          <div className="p-8 text-center">
            <p className="text-sm text-on-surface-variant mb-4">No organizations yet. Create the first tenant workspace.</p>
            <Link to="/admin/organizations/new">
              <Button variant="primary">Create organization</Button>
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-surface-container-high">
            {stats.recent_organizations.map((org) => (
              <li key={org.id}>
                <Link
                  to={`/admin/organizations/${org.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-surface-container-low/60 transition-colors"
                >
                  <div className="size-10 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0">
                    {org.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-on-surface truncate">{org.name}</p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {org.slug} · {org.admin_email || 'No admin'}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container-low text-primary border border-outline-variant/30">
                    {org.subscription_status}
                  </span>
                  <ArrowRight className="size-4 text-outline shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Container>
  );
}
