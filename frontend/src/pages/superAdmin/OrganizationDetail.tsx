import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Building2,
  Check,
  Clock,
  Copy,
  HardDrive,
  Headphones,
  KeyRound,
  LifeBuoy,
  MessageSquare,
  Phone,
  PhoneCall,
  PhoneOff,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
  Blocks,
  Box,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card, Container } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CopyField } from '@/components/superAdmin/CopyField';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchOrganization, updateOrganizationStatus, deleteOrganization } from '@/store/superAdmin/organizationThunks';
import { superAdminApi } from '@/api/superAdminApi';
import { getApiErrorMessage } from '@/api/errors';
import type { OrganizationFeatureItem, OrganizationFeaturesResponse } from '@/types/moduleTypes';

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return 'No activity yet';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTier(tier?: string | null): string {
  if (!tier) return 'Tier 1K (1,000/day)';
  switch (tier) {
    case 'TIER_250':
      return 'Tier 250 (250/day)';
    case 'TIER_1K':
      return 'Tier 1K (1,000/day)';
    case 'TIER_10K':
      return 'Tier 10K (10,000/day)';
    case 'TIER_100K':
      return 'Tier 100K (100,000/day)';
    case 'TIER_UNLIMITED':
      return 'Tier Unlimited';
    default:
      return tier.replace('_', ' ');
  }
}

type TabType = 'overview' | 'members' | 'modules' | 'settings';

export function OrganizationDetailPage() {
  const { id } = useParams();
  const dispatch = useAppDispatch();
  const { current, isLoading, error } = useAppSelector((state) => state.organizations);

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [bundleCopied, setBundleCopied] = useState(false);

  const navigate = useNavigate();

  // Modules & Features State
  const [orgFeatures, setOrgFeatures] = useState<OrganizationFeatureItem[]>([]);
  const [featureOverrides, setFeatureOverrides] = useState<Record<string, boolean>>({});
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false);
  const [isSavingFeatures, setIsSavingFeatures] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [featuresSaveSuccess, setFeaturesSaveSuccess] = useState(false);
  const [featuresError, setFeaturesError] = useState<string | null>(null);

  // Modal State for Status Change Confirmation
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Modal State for Delete Confirmation
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeletingOrg, setIsDeletingOrg] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadOrgFeatures = async () => {
    if (!id) return;
    setIsLoadingFeatures(true);
    setFeaturesError(null);
    try {
      const res = await superAdminApi.get<OrganizationFeaturesResponse>(
        `/api/v1/superadmin/organizations/${id}/features`
      );
      setOrgFeatures(res.data.modules);
      const map: Record<string, boolean> = {};
      res.data.modules.forEach((m) => {
        map[m.key] = m.enabled_for_workspace;
      });
      setFeatureOverrides(map);
    } catch (err) {
      setFeaturesError(getApiErrorMessage(err, 'Failed to load organization features'));
    } finally {
      setIsLoadingFeatures(false);
    }
  };


  const handleToggleFeature = async (key: string) => {
    if (!id || savingKey || isSavingFeatures) return;
    const currentVal = Boolean(featureOverrides[key]);
    const nextVal = !currentVal;

    // Optimistically update local UI state
    setFeatureOverrides((prev) => ({
      ...prev,
      [key]: nextVal,
    }));
    setSavingKey(key);
    setFeaturesError(null);

    try {
      await superAdminApi.patch(`/api/v1/superadmin/organizations/${id}/features`, {
        features: { [key]: nextVal },
      });
      setFeaturesSaveSuccess(true);
      await loadOrgFeatures();
      setTimeout(() => setFeaturesSaveSuccess(false), 2500);
    } catch (err) {
      // Revert optimistic update on failure
      setFeatureOverrides((prev) => ({
        ...prev,
        [key]: currentVal,
      }));
      setFeaturesError(getApiErrorMessage(err, `Failed to update ${key}`));
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveFeatures = async () => {
    if (!id) return;
    setIsSavingFeatures(true);
    setFeaturesError(null);
    setFeaturesSaveSuccess(false);
    try {
      await superAdminApi.patch(`/api/v1/superadmin/organizations/${id}/features`, {
        features: featureOverrides,
      });
      setFeaturesSaveSuccess(true);
      await loadOrgFeatures();
      setTimeout(() => setFeaturesSaveSuccess(false), 3000);
    } catch (err) {
      setFeaturesError(getApiErrorMessage(err, 'Failed to save organization features'));
    } finally {
      setIsSavingFeatures(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (!id) return;
    const map: Record<string, boolean> = {};
    orgFeatures.forEach((m) => {
      map[m.key] = m.default_enabled;
    });
    setFeatureOverrides(map);
    setIsSavingFeatures(true);
    setFeaturesError(null);
    try {
      await superAdminApi.patch(`/api/v1/superadmin/organizations/${id}/features`, {
        features: map,
      });
      setFeaturesSaveSuccess(true);
      await loadOrgFeatures();
      setTimeout(() => setFeaturesSaveSuccess(false), 3000);
    } catch (err) {
      setFeaturesError(getApiErrorMessage(err, 'Failed to reset features to defaults'));
    } finally {
      setIsSavingFeatures(false);
    }
  };

  useEffect(() => {
    if (id) dispatch(fetchOrganization(Number(id)));
  }, [dispatch, id]);

  const isActive = current?.subscription_status === 'active';

  const disconnectedNumbers = useMemo(() => {
    return (current?.whatsapp_numbers || []).filter((w) => w.status === 'disconnected');
  }, [current]);

  const handleToggleClick = () => {
    const nextStatus = isActive ? 'inactive' : 'active';
    setPendingStatus(nextStatus);
    setIsModalOpen(true);
  };

  const confirmStatusChange = async () => {
    if (!id || !pendingStatus) return;
    setIsUpdatingStatus(true);
    try {
      await dispatch(updateOrganizationStatus({ id: Number(id), status: pendingStatus })).unwrap();
      setIsModalOpen(false);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (!id || !current) return;
    setIsDeletingOrg(true);
    setDeleteError(null);
    try {
      await dispatch(deleteOrganization(Number(id))).unwrap();
      setIsDeleteModalOpen(false);
      navigate('/admin/organizations');
    } catch (err: unknown) {
      setDeleteError(typeof err === 'string' ? err : 'Failed to delete organization');
      setIsDeletingOrg(false);
    }
  };


  const credentialBundle = useMemo(() => {
    if (!current) return '';
    const lines = [
      `Organization: ${current.name}`,
      `Workspace slug: ${current.slug}`,
      `Support email: ${current.support_email}`,
      `Support phone: ${current.support_phone}`,
      `Admin name: ${current.admin?.name ?? ''}`,
      `Admin email: ${current.admin?.email ?? ''}`,
    ];
    lines.push(`Workspace login: ${window.location.origin}/login`);
    return lines.join('\n');
  }, [current]);

  async function copyBundle() {
    if (!credentialBundle) return;
    await navigator.clipboard.writeText(credentialBundle);
    setBundleCopied(true);
    window.setTimeout(() => setBundleCopied(false), 1800);
  }

  if (isLoading && !current) {
    return (
      <Container size="xl">
        <div className="p-12 text-center text-sm text-on-surface-variant animate-pulse">
          Loading workspace organization details and live metrics…
        </div>
      </Container>
    );
  }

  if (error || !current) {
    return (
      <Container size="xl">
        <Card className="p-8 text-center space-y-4 max-w-lg mx-auto">
          <p className="text-sm text-on-surface-variant">{error || 'Organization not found.'}</p>
          <Link to="/admin/organizations">
            <Button variant="secondary">Back to organizations</Button>
          </Link>
        </Card>
      </Container>
    );
  }

  const metrics = current.metrics;
  const monthTotal = metrics?.messages_this_month.total || 0;
  const customerCount = metrics?.messages_this_month.customer || 0;
  const aiCount = metrics?.messages_this_month.ai || 0;
  const agentCount = metrics?.messages_this_month.agent || 0;

  const customerPct = monthTotal > 0 ? Math.round((customerCount / monthTotal) * 100) : 0;
  const aiPct = monthTotal > 0 ? Math.round((aiCount / monthTotal) * 100) : 0;
  const agentPct = monthTotal > 0 ? Math.round((agentCount / monthTotal) * 100) : 0;

  return (
    <Container size="xl">
      {/* Top back navigation link */}
      <Link
        to="/admin/organizations"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary mb-6 transition-colors"
      >
        <ArrowLeft className="size-4" />
        All organizations
      </Link>

      {/* Header section with Title, Status & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-3 border border-outline-variant/30">
            <ShieldCheck className="size-3.5" />
            Workspace Organization
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">{current.name}</h1>
            <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-surface-container-low text-on-surface-variant border border-outline-variant/30">
              {current.slug}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Clock className="size-3.5 text-outline" />
              Last active: <strong className="text-on-surface font-semibold">{formatRelativeTime(metrics?.last_activity)}</strong>
            </span>
            <span className="text-outline-variant">·</span>
            <span className="flex items-center gap-1">
              <Users className="size-3.5 text-outline" />
              <strong className="text-on-surface font-semibold">{current.members?.length || current.user_count}</strong> team members
            </span>
          </div>
        </div>

        {/* Status indicator, Deactivate / Activate toggle button, and Delete button */}
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <span
            className={clsx(
              'inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border',
              isActive
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25'
                : 'bg-amber-500/10 text-amber-600 border-amber-500/25',
            )}
          >
            <span className={clsx('size-1.5 rounded-full', isActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500')} />
            {current.subscription_status}
          </span>
          <Button
            variant={isActive ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleToggleClick}
            className="cursor-pointer"
          >
            {isActive ? 'Deactivate Workspace' : 'Activate Workspace'}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDeleteConfirmationText('');
              setDeleteError(null);
              setIsDeleteModalOpen(true);
            }}
            className="text-rose-600 hover:bg-rose-500/10 hover:border-rose-500/40 border border-outline-variant/40 cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="size-3.5" />
            <span>Delete Workspace</span>
          </Button>
        </div>
      </div>

      {/* Disconnected Number Warning Banner */}
      {disconnectedNumbers.length > 0 && (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-800">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-600 shrink-0">
              <PhoneOff className="size-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm text-rose-900">
                Disconnected WhatsApp {disconnectedNumbers.length === 1 ? 'Number' : 'Numbers'} Detected ({disconnectedNumbers.length})
              </h3>
              <p className="text-xs text-rose-800/90 mt-0.5">
                Meta cloud token expired or permissions were revoked. Incoming queries will fail and broadcasts are halted on disconnected lines.
              </p>
              <div className="mt-3 space-y-2">
                {disconnectedNumbers.map((num) => (
                  <div
                    key={num.id}
                    className="p-3 rounded-xl bg-surface-container-lowest/90 border border-rose-500/25 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono font-bold text-on-surface">
                      <span>
                        {num.display_phone_number} {num.verified_name ? `(${num.verified_name})` : ''}
                      </span>
                      <span className="text-[10px] text-rose-600 uppercase font-semibold px-2 py-0.5 rounded bg-rose-500/10">
                        Disconnected
                      </span>
                    </div>
                    {num.disconnect_reason && (
                      <p className="mt-1 text-on-surface-variant font-sans text-xs">
                        <strong>Reason:</strong> {num.disconnect_reason}
                        {num.disconnect_subcode ? ` (Error subcode: ${num.disconnect_subcode})` : ''}
                      </p>
                    )}
                    {num.disconnected_at && (
                      <p className="mt-0.5 text-outline text-[11px]">
                        Disconnected at: {new Date(num.disconnected_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation Controls */}
      <div className="flex items-center gap-2 border-b border-outline-variant/30 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer',
            activeTab === 'overview'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface',
          )}
        >
          <Sparkles className="size-4" />
          Health & Analytics
          {disconnectedNumbers.length > 0 && (
            <span className="size-2 rounded-full bg-rose-500" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('members')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer',
            activeTab === 'members'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface',
          )}
        >
          <Users className="size-4" />
          Team Members
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant font-bold border border-outline-variant/30">
            {current.members?.length ?? current.user_count}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('modules');
            loadOrgFeatures(); // Load the module switches when the tab is opened
          }}
          className={clsx(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer',
            activeTab === 'modules'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface',
          )}
        >
          <Blocks className="size-4" />
          Modules & Features
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer',
            activeTab === 'settings'
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface',
          )}
        >
          <KeyRound className="size-4" />
          Credentials & Workspace Details
        </button>
      </div>

      {/* Tab 1: Health & Analytics Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* WhatsApp Numbers Card */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="size-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <Phone className="size-4" />
                </div>
                <span
                  className={clsx(
                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                    disconnectedNumbers.length > 0
                      ? 'bg-rose-500/10 text-rose-600'
                      : 'bg-emerald-500/10 text-emerald-600',
                  )}
                >
                  {disconnectedNumbers.length > 0
                    ? `${disconnectedNumbers.length} Disconnected`
                    : 'All Connected'}
                </span>
              </div>
              <div className="text-2xl font-bold text-on-surface mb-0.5">
                {current.whatsapp_numbers?.length || current.whatsapp_count || 0}
              </div>
              <p className="text-xs text-on-surface-variant font-medium">WhatsApp Numbers</p>
            </Card>

            {/* Active Chats Card */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="size-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <MessageSquare className="size-4" />
                </div>
                <span className="text-xs text-outline font-medium">
                  {metrics?.total_chats ?? 0} total chats
                </span>
              </div>
              <div className="text-2xl font-bold text-on-surface mb-0.5">
                {metrics?.active_chats ?? 0}
              </div>
              <p className="text-xs text-on-surface-variant font-medium">Active Customer Conversations</p>
            </Card>

            {/* Support Tickets Card */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="size-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <LifeBuoy className="size-4" />
                </div>
                <span className="text-xs font-semibold text-emerald-600">
                  {metrics?.resolved_tickets ?? 0} resolved
                </span>
              </div>
              <div className="text-2xl font-bold text-on-surface mb-0.5">
                {metrics?.open_tickets ?? 0}{' '}
                <span className="text-sm font-normal text-on-surface-variant">
                  / {metrics?.total_tickets ?? 0}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant font-medium">Open Support Tickets</p>
            </Card>

            {/* Media Storage Used Card */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="size-9 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
                  <HardDrive className="size-4" />
                </div>
                <span className="text-xs text-outline font-medium">Media & Docs</span>
              </div>
              <div className="text-2xl font-bold text-on-surface mb-0.5">
                {formatBytes(metrics?.storage_used_bytes ?? 0)}
              </div>
              <p className="text-xs text-on-surface-variant font-medium">Storage Utilized</p>
            </Card>
          </div>

          {/* WhatsApp Numbers Connectivity & Status List */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Phone className="size-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface">
                  WhatsApp Business Numbers ({current.whatsapp_numbers?.length ?? 0})
                </h3>
              </div>
            </div>

            {!current.whatsapp_numbers || current.whatsapp_numbers.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant text-sm bg-surface-container-low/40 rounded-xl border border-outline-variant/20">
                <PhoneOff className="size-8 mx-auto mb-2 text-outline" />
                No WhatsApp numbers have been linked to this workspace yet.
              </div>
            ) : (
              <div className="grid gap-4">
                {current.whatsapp_numbers.map((num) => {
                  const isConnected = num.status === 'connected';
                  return (
                    <div
                      key={num.id}
                      className={clsx(
                        'p-4 rounded-xl border transition-all',
                        isConnected
                          ? 'bg-surface-container-lowest border-outline-variant/30 hover:border-primary/40 shadow-xs'
                          : 'bg-rose-500/5 border-rose-500/30',
                      )}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={clsx(
                              'size-10 rounded-xl flex items-center justify-center font-bold shrink-0',
                              isConnected
                                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-600 border border-rose-500/20',
                            )}
                          >
                            {isConnected ? <PhoneCall className="size-5" /> : <PhoneOff className="size-5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-bold text-base text-on-surface font-mono">
                                {num.display_phone_number}
                              </h4>
                              {num.verified_name && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant border border-outline-variant/20">
                                  {num.verified_name}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-mono text-on-surface-variant/70 mt-0.5 truncate">
                              Phone ID: {num.phone_number_id} {num.waba_id ? `· WABA ID: ${num.waba_id}` : ''}
                            </p>
                          </div>
                        </div>

                        {/* Status, Quality Rating, and Tier Badges */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {/* Connection Status */}
                          <span
                            className={clsx(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider',
                              isConnected
                                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-600 border border-rose-500/30',
                            )}
                          >
                            <span
                              className={clsx('size-1.5 rounded-full', isConnected ? 'bg-emerald-500' : 'bg-rose-500')}
                            />
                            {num.status}
                          </span>

                          {/* Quality Rating */}
                          <span
                            className={clsx(
                              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold',
                              num.quality_rating === 'GREEN' &&
                                'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
                              num.quality_rating === 'YELLOW' &&
                                'bg-amber-500/10 text-amber-600 border border-amber-500/20',
                              num.quality_rating === 'RED' &&
                                'bg-rose-500/10 text-rose-600 border border-rose-500/20',
                            )}
                          >
                            Quality: {num.quality_rating}
                          </span>

                          {/* Messaging Tier */}
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container-low text-on-surface-variant border border-outline-variant/30">
                            {formatTier(num.messaging_tier)}
                          </span>
                        </div>
                      </div>

                      {/* Disconnection reason details */}
                      {!isConnected && (
                        <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-800">
                          <div className="font-semibold flex items-center gap-1.5 text-rose-900 mb-0.5">
                            <AlertTriangle className="size-3.5" />
                            Disconnection Diagnosis:
                          </div>
                          <p className="font-sans">
                            {num.disconnect_reason || 'Connection was terminated by WhatsApp/Meta.'}
                            {num.disconnect_subcode ? ` (Meta error subcode: ${num.disconnect_subcode})` : ''}
                          </p>
                          {num.disconnected_at && (
                            <p className="text-[11px] text-rose-700/80 mt-1">
                              Disconnected timestamp: {new Date(num.disconnected_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Monthly Messages Breakdown (Customer vs AI vs Agent) */}
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface">
                  Messages This Month
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Monthly message traffic divided between customer queries, automated Gemini AI responses, and human agents.
                </p>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-2xl font-black text-on-surface">
                  {monthTotal.toLocaleString()}
                </div>
                <span className="text-[11px] text-on-surface-variant font-medium">total messages this month</span>
              </div>
            </div>

            {/* Visual ratio bar */}
            <div className="h-3 w-full bg-surface-container-low rounded-full overflow-hidden flex gap-0.5 mb-4 p-0.5 border border-outline-variant/20">
              {customerCount > 0 && (
                <div
                  style={{ width: `${customerPct}%` }}
                  className="h-full bg-blue-500 rounded-l-full transition-all duration-500"
                  title={`Customer: ${customerCount} (${customerPct}%)`}
                />
              )}
              {aiCount > 0 && (
                <div
                  style={{ width: `${aiPct}%` }}
                  className="h-full bg-primary transition-all duration-500"
                  title={`AI Gemini: ${aiCount} (${aiPct}%)`}
                />
              )}
              {agentCount > 0 && (
                <div
                  style={{ width: `${agentPct}%` }}
                  className="h-full bg-emerald-500 rounded-r-full transition-all duration-500"
                  title={`Human Agent: ${agentCount} (${agentPct}%)`}
                />
              )}
            </div>

            {/* 3 Detail columns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-outline-variant/20">
              <div className="p-3.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/20">
                <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-on-surface">
                  <span className="size-2 rounded-full bg-blue-500" />
                  Customer Inbound
                </div>
                <div className="text-xl font-bold text-on-surface">
                  {customerCount.toLocaleString()}
                </div>
                <span className="text-[11px] text-on-surface-variant">{customerPct}% of monthly volume</span>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/20">
                <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-primary">
                  <Bot className="size-3.5 text-primary" />
                  AI (Gemini) Calls & Replies
                </div>
                <div className="text-xl font-bold text-primary">
                  {aiCount.toLocaleString()}
                </div>
                <span className="text-[11px] text-on-surface-variant">
                  {aiPct}% of monthly volume ({metrics?.total_ai_replies.toLocaleString() ?? 0} all-time)
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/20">
                <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-emerald-600">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Human Agent Replies
                </div>
                <div className="text-xl font-bold text-emerald-600">
                  {agentCount.toLocaleString()}
                </div>
                <span className="text-[11px] text-on-surface-variant">{agentPct}% of monthly volume</span>
              </div>
            </div>
          </Card>

          {/* Broadcasts & Additional System Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Broadcasts card */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface">
                  <Send className="size-4 text-primary" />
                  Broadcast Campaigns
                </div>
                <span className="text-xs font-semibold text-emerald-600 px-2 py-0.5 rounded-full bg-emerald-500/10">
                  {metrics?.broadcasts_completed ?? 0} Completed
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-extrabold text-on-surface">{metrics?.broadcasts_sent ?? 0}</span>
                <span className="text-xs text-on-surface-variant">total campaigns created</span>
              </div>
              <p className="text-xs text-on-surface-variant mt-2">
                Automated and scheduled broadcast dispatches to customer and contact audiences.
              </p>
            </Card>

            {/* Media Storage details card */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface">
                  <HardDrive className="size-4 text-purple-600" />
                  Media & Document Storage
                </div>
                <span className="text-xs font-semibold text-purple-600 px-2 py-0.5 rounded-full bg-purple-500/10">
                  Disk Storage
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-extrabold text-on-surface">
                  {formatBytes(metrics?.storage_used_bytes ?? 0)}
                </span>
                <span className="text-xs text-on-surface-variant">total storage used</span>
              </div>
              <p className="text-xs text-on-surface-variant mt-2">
                Includes customer chat attachments (images, PDFs, documents) and knowledge base documents.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 2: Team Members & Assigned Roles */}
      {activeTab === 'members' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">
                  Team Members ({current.members?.length ?? current.user_count})
                </h2>
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                All registered accounts attached to this client workspace, including their permission roles and account activity.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-xl border border-outline-variant/30">
              <span className="font-bold text-on-surface">
                {current.members?.filter((m) => m.is_active).length ?? 0}
              </span>{' '}
              Active Accounts
            </div>
          </div>

          {!current.members || current.members.length === 0 ? (
            <div className="text-center py-10 text-on-surface-variant text-sm bg-surface-container-low/40 rounded-xl border border-outline-variant/20">
              <Users className="size-8 mx-auto mb-2 text-outline" />
              No members are currently enrolled in this organization workspace.
            </div>
          ) : (
            <div className="grid gap-3">
              {current.members.map((member) => {
                const isPrimaryAdmin = current.admin?.id === member.id;
                const isAdmin = member.role === 'admin';
                const isManager = member.role === 'manager';
                const isService = member.role === 'service' || member.role === 'agent';

                return (
                  <div
                    key={member.id}
                    className="p-4 rounded-xl border border-outline-variant/25 bg-surface-container-lowest hover:border-primary/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={clsx(
                          'size-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border',
                          isAdmin
                            ? 'bg-purple-500/10 text-purple-700 border-purple-500/25'
                            : isManager
                            ? 'bg-blue-500/10 text-blue-600 border-blue-500/25'
                            : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25',
                        )}
                      >
                        {member.name ? member.name[0]?.toUpperCase() : 'U'}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-sm text-on-surface truncate">
                            {member.name}
                          </h3>
                          {isPrimaryAdmin && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                              Primary Admin
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-on-surface-variant/80 truncate mt-0.5">
                          {member.email}
                        </p>
                      </div>
                    </div>

                    {/* Role badge, Active status, and Joined date */}
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      {/* Role Badge */}
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize border',
                          isAdmin
                            ? 'bg-purple-500/10 text-purple-700 border-purple-500/25'
                            : isManager
                            ? 'bg-blue-500/10 text-blue-700 border-blue-500/25'
                            : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25',
                        )}
                      >
                        {isAdmin && <KeyRound className="size-3" />}
                        {isManager && <ShieldCheck className="size-3" />}
                        {isService && <Headphones className="size-3" />}
                        {member.role}
                      </span>

                      {/* Active Status Badge */}
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border',
                          member.is_active
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            : 'bg-outline-variant/30 text-outline border-outline-variant/40',
                        )}
                      >
                        <span
                          className={clsx('size-1.5 rounded-full', member.is_active ? 'bg-emerald-500' : 'bg-outline')}
                        />
                        {member.is_active ? 'Active' : 'Inactive'}
                      </span>

                      {/* Joined Date */}
                      {member.created_at && (
                        <span className="text-[11px] text-outline font-medium hidden md:inline-block">
                          Joined{' '}
                          {new Date(member.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Tab: Modules & Feature Configuration */}
      {activeTab === 'modules' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-surface-container-high">
            <div>
              <div className="flex items-center gap-2">
                <Blocks className="size-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">
                  Workspace Modules & Feature Flags
                </h2>
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                Enable or disable specific platform modules for <strong>{current.name}</strong>. Disabled modules are hidden from sidebar navigation and blocked from direct URL access.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetToDefaults}
                disabled={isSavingFeatures || isLoadingFeatures}
                className="text-xs"
              >
                Reset to Defaults
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSaveFeatures}
                disabled={isSavingFeatures || isLoadingFeatures}
                className="glow-primary text-xs"
              >
                {isSavingFeatures ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Check className="size-3.5 mr-1" />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Feedback Banners */}
          {featuresSaveSuccess && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs flex items-center gap-2 animate-in fade-in">
              <Check className="size-4 shrink-0" />
              <span>Workspace feature flags saved successfully! An audit log has been recorded.</span>
            </div>
          )}

          {featuresError && (
            <div className="mb-6 p-4 rounded-xl bg-error-container/30 border border-error/30 text-error text-xs flex items-center justify-between">
              <span>{featuresError}</span>
              <Button variant="ghost" size="sm" onClick={loadOrgFeatures} className="text-xs h-7">
                Retry
              </Button>
            </div>
          )}

          {/* Switchboard Content */}
          {isLoadingFeatures ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-4 rounded-xl border border-outline-variant/30 animate-pulse space-y-3">
                  <div className="h-4 w-32 bg-surface-container-high rounded" />
                  <div className="h-8 bg-surface-container-high rounded" />
                </div>
              ))}
            </div>
          ) : orgFeatures.length === 0 ? (
            <div className="py-12 text-center text-on-surface-variant">
              <Blocks className="size-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold">No platform modules registered yet.</p>
              <p className="text-xs mt-1">Visit the Platform Modules catalog to add modules.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {orgFeatures.map((m) => {
                const isEnabled = Boolean(featureOverrides[m.key]);
                const isOverride = m.key in featureOverrides ? featureOverrides[m.key] !== m.default_enabled : Boolean(m.is_custom_override);

                return (
                  <div
                    key={m.key}
                    className={clsx(
                      'p-4 rounded-xl border transition-all flex flex-col justify-between',
                      isEnabled
                        ? 'bg-surface-container-lowest border-outline-variant/40 shadow-xs hover:border-primary/40'
                        : 'bg-surface-container-low/30 border-outline-variant/20 opacity-80',
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={clsx(
                              'size-9 rounded-xl flex items-center justify-center shrink-0 border',
                              isEnabled
                                ? 'bg-primary/10 text-primary border-primary/20'
                                : 'bg-surface-container text-on-surface-variant border-outline-variant/20',
                            )}
                          >
                            <Box className="size-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-on-surface">{m.name}</h4>
                            <span className="font-mono text-[11px] text-on-surface-variant bg-surface-container px-1.5 py-0.2 rounded border border-outline-variant/20">
                              {m.key}
                            </span>
                          </div>
                        </div>

                        {/* Interactive Toggle Switch */}
                        <div className="flex items-center gap-2">
                          {savingKey === m.key && (
                            <div className="size-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          )}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isEnabled}
                            disabled={savingKey === m.key || isSavingFeatures || isLoadingFeatures}
                            onClick={() => handleToggleFeature(m.key)}
                            className={clsx(
                              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                              isEnabled ? 'bg-primary' : 'bg-surface-container-highest',
                              (savingKey === m.key || isSavingFeatures) && 'opacity-60 cursor-not-allowed',
                            )}
                          >
                            <span
                              className={clsx(
                                'pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                                isEnabled ? 'translate-x-5' : 'translate-x-0',
                              )}
                            />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-on-surface-variant line-clamp-2 mt-2">
                        {m.description || 'Controls access to this feature.'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-surface-container-high/60 text-[11px]">
                      <span className="text-on-surface-variant font-medium">
                        Category: <strong className="text-on-surface">{m.category}</strong>
                      </span>

                      <div className="flex items-center gap-1.5">
                        {!m.is_active_globally && (
                          <span className="px-2 py-0.5 rounded-full bg-error-container/40 text-error font-semibold">
                            Globally Inactive
                          </span>
                        )}
                        {isOverride ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-semibold border border-amber-500/20">
                            Custom Override
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                            Default: {m.default_enabled ? 'ON' : 'OFF'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Tab 3: Credentials & Workspace Details */}
      {activeTab === 'settings' && (
        <div className="grid gap-6">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Organization details</h2>
              </div>
              <Button variant="secondary" size="sm" onClick={copyBundle}>
                {bundleCopied ? <Check className="size-3.5 text-tertiary" /> : <Copy className="size-3.5" />}
                {bundleCopied ? 'Copied pack' : 'Copy all credentials'}
              </Button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <CopyField label="Organization name" value={current.name} />
              <CopyField label="Workspace slug" value={current.slug} mono />
              <CopyField label="Support email" value={current.support_email} />
              <CopyField label="Support phone" value={current.support_phone} />
              <CopyField label="Total users" value={String(current.members?.length || current.user_count)} />
              <CopyField label="WhatsApp numbers" value={String(current.whatsapp_numbers?.length || current.whatsapp_count)} />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <KeyRound className="size-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Admin user credentials</h2>
            </div>
            {current.admin ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <CopyField label="Admin name" value={current.admin.name} />
                <CopyField label="Admin email" value={current.admin.email} />
                <CopyField label="Role" value={current.admin.role} />
                <div className="sm:col-span-2 rounded-xl border border-outline-variant/40 bg-surface-container-low/70 px-3 py-3 text-xs text-on-surface-variant">
                  The administrator chose their own password when setting up the workspace; it is never visible to platform admins.
                </div>
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">No admin user is attached to this organization.</p>
            )}
          </Card>

          {/* Danger Zone */}
          <Card className="p-6 border-rose-500/30 bg-rose-500/5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-rose-600 flex items-center gap-2">
                  <Trash2 className="size-4" />
                  <span>Delete Organization</span>
                </h3>
                <p className="text-xs text-on-surface-variant mt-1 max-w-xl leading-relaxed">
                  Permanently delete this organization and purge all associated team members, connected WhatsApp numbers, customer conversations, tickets, broadcasts, and media files. This action cannot be undone.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDeleteConfirmationText('');
                  setDeleteError(null);
                  setIsDeleteModalOpen(true);
                }}
                className="bg-rose-600 text-white hover:bg-rose-700 border-transparent shrink-0 cursor-pointer"
              >
                Delete Workspace
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Confirmation Modal for Activate / Deactivate */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <AlertCircle className="size-4" />
                </div>
                <h3 className="text-lg font-bold text-on-surface">Confirm Workspace Status</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              Are you sure you want to change the status of <strong>{current.name}</strong> to{' '}
              <span className="uppercase font-semibold text-primary">{pendingStatus}</span>? Setting a workspace to{' '}
              <strong>inactive</strong> suspends incoming automated replies, halts broadcast campaigns, and blocks agent logins.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)} disabled={isUpdatingStatus}>
                Cancel
              </Button>
              <Button size="sm" onClick={confirmStatusChange} disabled={isUpdatingStatus}>
                {isUpdatingStatus ? 'Updating...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-surface-container-lowest border border-rose-500/30 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600">
                  <Trash2 className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface">Delete Organization</h3>
                  <p className="text-[11px] text-rose-600 font-medium">Permanent & Irreversible Action</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs text-on-surface-variant">
              <p className="leading-relaxed">
                You are about to permanently delete <strong className="text-on-surface">{current.name}</strong> (<code className="text-primary font-mono">{current.slug}</code>). All associated records, databases, and physical media files will be wiped out immediately:
              </p>

              <div className="bg-surface-container rounded-xl p-3.5 border border-outline-variant/30 space-y-2 text-[11px]">
                <div className="flex items-center gap-2 text-on-surface">
                  <Users className="size-3.5 text-primary shrink-0" />
                  <span><strong>{current.members?.length || current.user_count}</strong> Team Members & Admin Accounts</span>
                </div>
                <div className="flex items-center gap-2 text-on-surface">
                  <Phone className="size-3.5 text-primary shrink-0" />
                  <span><strong>{current.whatsapp_numbers?.length || current.whatsapp_count}</strong> WhatsApp Connected Numbers & Cloud Tokens</span>
                </div>
                <div className="flex items-center gap-2 text-on-surface">
                  <MessageSquare className="size-3.5 text-primary shrink-0" />
                  <span><strong>{metrics?.total_chats ?? 0}</strong> Customer Conversations & Full Chat History</span>
                </div>
                <div className="flex items-center gap-2 text-on-surface">
                  <LifeBuoy className="size-3.5 text-primary shrink-0" />
                  <span><strong>{metrics?.total_tickets ?? 0}</strong> Support Tickets & Activity Audits</span>
                </div>
                <div className="flex items-center gap-2 text-on-surface">
                  <Send className="size-3.5 text-primary shrink-0" />
                  <span><strong>{metrics?.broadcasts_sent ?? 0}</strong> Broadcast Campaigns & Recipient Delivery Logs</span>
                </div>
                <div className="flex items-center gap-2 text-on-surface">
                  <HardDrive className="size-3.5 text-primary shrink-0" />
                  <span><strong>{formatBytes(metrics?.storage_used_bytes || 0)}</strong> Disk Storage (Media Attachments & Knowledge PDFs)</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-semibold text-on-surface">
                  To confirm deletion, please type <strong className="text-rose-600 font-mono">{current.slug}</strong> below:
                </label>
                <input
                  type="text"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder={current.slug}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/50 bg-surface text-on-surface text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeletingOrg}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleDeleteOrganization}
                disabled={
                  deleteConfirmationText.trim().toLowerCase() !== current.slug.toLowerCase() ||
                  isDeletingOrg
                }
                className="px-4 py-2 rounded-xl text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {isDeletingOrg ? (
                  <>
                    <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deleting Workspace...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="size-3.5" />
                    <span>Permanently Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}