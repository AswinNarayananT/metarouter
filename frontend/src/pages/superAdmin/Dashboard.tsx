import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  MessageSquare,
  PhoneOff,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card, Container } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchDashboardStats } from '@/store/superAdmin/organizationThunks';

const STAT_META = [
  { key: 'organization_count' as const, label: 'Organizations', icon: Building2 },
  { key: 'active_organization_count' as const, label: 'Active organizations', icon: Sparkles },
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

  const handleRefresh = () => {
    dispatch(fetchDashboardStats());
  };

  const disconnectedCount = stats?.disconnected_numbers_count ?? 0;
  const failed24h = stats?.failed_messages_24h ?? 0;
  const geminiErrors24h = stats?.gemini_errors_24h ?? 0;
  const stuckTasks = stats?.stuck_tasks_count ?? 0;

  return (
    <Container>
      {/* Top Header section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-3 border border-outline-variant/30">
            <Sparkles className="size-3.5" />
            Super Admin Control Center
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant max-w-2xl">
            Monitor infrastructure health, manage tenant workspaces, and oversee AI gateway operations across all client accounts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh dashboard stats"
            className="cursor-pointer"
          >
            <RefreshCw className={clsx('size-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>

          <Link to="/admin/organizations/new">
            <Button variant="primary" size="sm" className="glow-primary shrink-0">
              Create organization
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl bg-error-container text-on-error-container text-sm px-4 py-3 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            Retry
          </Button>
        </div>
      )}

      {/* Disconnected Numbers Alert Banner (Critical Incident Alert) */}
      {stats && disconnectedCount > 0 && (
        <div className="mb-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-900 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-600 shrink-0">
              <PhoneOff className="size-5" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-rose-950">
                  {disconnectedCount} WhatsApp {disconnectedCount === 1 ? 'Number' : 'Numbers'} Disconnected Across Workspaces
                </h3>
                <span className="text-[11px] font-semibold text-rose-700 bg-rose-500/15 px-2.5 py-0.5 rounded-full border border-rose-500/20">
                  Immediate Action Required
                </span>
              </div>
              <p className="text-xs text-rose-800/90 mt-1">
                These numbers cannot send broadcasts or receive incoming customer chats due to invalid/expired Meta tokens.
              </p>

              <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {stats.disconnected_numbers.map((item) => (
                  <Link
                    key={item.id}
                    to={`/admin/organizations/${item.organization_id}`}
                    className="p-3 rounded-xl bg-surface-container-lowest border border-rose-500/25 hover:border-rose-500 transition-all group block shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-xs text-on-surface">
                        {item.display_phone_number}
                      </span>
                      <ArrowRight className="size-3.5 text-rose-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-[11px] text-on-surface-variant font-medium mt-1 truncate">
                      {item.organization_name} ({item.organization_slug})
                    </p>
                    {item.disconnect_reason && (
                      <p className="text-[10px] text-rose-700 mt-1 truncate">
                        {item.disconnect_reason}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Platform Health & Monitoring Operational Strip */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="size-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">
            Platform Health & Operations
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Numbers Disconnected */}
          <Card
            className={clsx(
              'p-5 transition-all border',
              disconnectedCount > 0
                ? 'bg-rose-500/5 border-rose-500/30'
                : 'bg-surface-container-lowest border-outline-variant/30',
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Disconnected Numbers
                </p>
                <p
                  className={clsx(
                    'mt-1 text-3xl font-extrabold',
                    disconnectedCount > 0 ? 'text-rose-600' : 'text-on-surface',
                  )}
                >
                  {isLoading && !stats ? '—' : disconnectedCount}
                </p>
              </div>
              <div
                className={clsx(
                  'size-10 rounded-xl flex items-center justify-center shrink-0 border',
                  disconnectedCount > 0
                    ? 'bg-rose-500/10 text-rose-600 border-rose-500/25'
                    : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                )}
              >
                {disconnectedCount > 0 ? <PhoneOff className="size-5" /> : <CheckCircle2 className="size-5" />}
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-2">
              {disconnectedCount > 0 ? (
                <span className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  Lines down across workspaces
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  All WhatsApp numbers connected
                </span>
              )}
            </div>
          </Card>

          {/* 2. Failed Messages (Last 24h) */}
          <Card
            className={clsx(
              'p-5 transition-all border',
              failed24h > 0
                ? 'bg-rose-500/5 border-rose-500/30'
                : 'bg-surface-container-lowest border-outline-variant/30',
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Failed Messages (24h)
                </p>
                <p
                  className={clsx(
                    'mt-1 text-3xl font-extrabold',
                    failed24h > 0 ? 'text-rose-600' : 'text-on-surface',
                  )}
                >
                  {isLoading && !stats ? '—' : failed24h}
                </p>
              </div>
              <div
                className={clsx(
                  'size-10 rounded-xl flex items-center justify-center shrink-0 border',
                  failed24h > 0
                    ? 'bg-rose-500/10 text-rose-600 border-rose-500/25'
                    : 'bg-surface-container-low text-primary border-outline-variant/30',
                )}
              >
                <XCircle className="size-5" />
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-2">
              {failed24h > 0 ? (
                <span className="text-[11px] font-semibold text-rose-600">
                  Delivery or Meta API errors
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  100% successful deliveries
                </span>
              )}
            </div>
          </Card>

          {/* 3. Gemini Errors & Fallbacks */}
          <Card
            className={clsx(
              'p-5 transition-all border',
              geminiErrors24h > 0
                ? 'bg-amber-500/5 border-amber-500/30'
                : 'bg-surface-container-lowest border-outline-variant/30',
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Gemini Errors & Fallbacks
                </p>
                <p
                  className={clsx(
                    'mt-1 text-3xl font-extrabold',
                    geminiErrors24h > 0 ? 'text-amber-600' : 'text-on-surface',
                  )}
                >
                  {isLoading && !stats ? '—' : geminiErrors24h}
                </p>
              </div>
              <div
                className={clsx(
                  'size-10 rounded-xl flex items-center justify-center shrink-0 border',
                  geminiErrors24h > 0
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/25'
                    : 'bg-surface-container-low text-primary border-outline-variant/30',
                )}
              >
                <Bot className="size-5" />
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-2">
              {geminiErrors24h > 0 ? (
                <span className="text-[11px] font-semibold text-amber-600">
                  Escalated to human fallback
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  AI generating cleanly
                </span>
              )}
            </div>
          </Card>

          {/* 4. Stuck Background Tasks */}
          <Card
            className={clsx(
              'p-5 transition-all border',
              stuckTasks > 0
                ? 'bg-amber-500/5 border-amber-500/30'
                : 'bg-surface-container-lowest border-outline-variant/30',
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Stuck Background Tasks
                </p>
                <p
                  className={clsx(
                    'mt-1 text-3xl font-extrabold',
                    stuckTasks > 0 ? 'text-amber-600' : 'text-on-surface',
                  )}
                >
                  {isLoading && !stats ? '—' : stuckTasks}
                </p>
              </div>
              <div
                className={clsx(
                  'size-10 rounded-xl flex items-center justify-center shrink-0 border',
                  stuckTasks > 0
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/25'
                    : 'bg-surface-container-low text-primary border-outline-variant/30',
                )}
              >
                <RotateCcw className={clsx('size-5', stuckTasks > 0 && 'animate-spin')} />
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-2">
              {stuckTasks > 0 ? (
                <span className="text-[11px] font-semibold text-amber-700 truncate">
                  {stats?.stuck_tasks?.stuck_messages ?? 0} msgs · {stats?.stuck_tasks?.stuck_documents ?? 0} docs · {stats?.stuck_tasks?.stuck_attachments ?? 0} media
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Celery sweepers clear
                </span>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Core Provisioning & Workspace Stats Grid */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="size-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">
            Tenant Workspaces & Accounts
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      </div>

      {/* Recent Organizations list */}
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
          <p className="p-6 text-sm text-on-surface-variant">Loading organizations…</p>
        ) : !stats?.recent_organizations.length ? (
          <div className="p-8 text-center">
            <p className="text-sm text-on-surface-variant mb-4">No organizations yet. Create the first one.</p>
            <Link to="/admin/organizations/new">
              <Button variant="primary">Create organization</Button>
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-surface-container-high">
            {stats.recent_organizations.map((org) => {
              const isActive = org.subscription_status === 'active';
              return (
                <li key={org.id}>
                  <Link
                    to={`/admin/organizations/${org.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-surface-container-low/60 transition-colors group"
                  >
                    <div className="size-10 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 border border-primary/20">
                      {org.name[0]?.toUpperCase() || 'O'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
                        {org.name}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {org.slug} · {org.admin_email || 'No admin'} · {org.user_count} {org.user_count === 1 ? 'user' : 'users'}
                      </p>
                    </div>
                    <span
                      className={clsx(
                        'text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border',
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25'
                          : 'bg-amber-500/10 text-amber-600 border-amber-500/25',
                      )}
                    >
                      {org.subscription_status}
                    </span>
                    <ArrowRight className="size-4 text-outline shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Container>
  );
}
