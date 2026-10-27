import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Check,
  Download,
  Globe,
  KeyRound,
  RefreshCw,
  ScrollText,
  Search,
  Shield,
  ShieldCheck,
  X,
  Eye,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card, Container } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchAuditLogs, exportAuditLogsCsv } from '@/store/superAdmin/auditLogThunks';
import { setSelectedLog } from '@/store/superAdmin/auditLogSlice';
import type { AuditLogCategory, AuditLogStatus } from '@/types/auditLogTypes';

const CATEGORIES: { value: AuditLogCategory; label: string; icon: typeof Shield }[] = [
  { value: 'all', label: 'All Categories', icon: ScrollText },
  { value: 'organization', label: 'Organization', icon: Building2 },
  { value: 'security', label: 'Security & Auth', icon: ShieldCheck },
  { value: 'access_control', label: 'Access Control', icon: KeyRound },
  { value: 'gateway', label: 'Gateway & Infrastructure', icon: Globe },
];

const STATUSES: { value: AuditLogStatus; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
  { value: 'failure', label: 'Failure' },
];

function getPageNumbers(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 3) {
    return [1, 2, 3, 4, '...', totalPages];
  }
  if (currentPage >= totalPages - 2) {
    return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
}

function formatTimestamp(isoString: string): { formatted: string; relative: string } {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { formatted: isoString, relative: '' };
    
    const formatted = d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    let relative = '';
    if (diffDay > 0) relative = `${diffDay}d ago`;
    else if (diffHour > 0) relative = `${diffHour}h ago`;
    else if (diffMin > 0) relative = `${diffMin}m ago`;
    else relative = 'just now';

    return { formatted, relative };
  } catch {
    return { formatted: isoString, relative: '' };
  }
}

function getActionBadge(action: string) {
  const norm = action.toUpperCase();
  if (norm.includes('DELETED')) {
    return {
      label: action,
      bg: 'bg-error-container/40 text-error border-error/30',
      dot: 'bg-error',
    };
  }
  if (norm.includes('CREATED') || norm.includes('ONBOARDED')) {
    return {
      label: action,
      bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      dot: 'bg-emerald-400',
    };
  }
  if (norm.includes('REVOKED') || norm.includes('WARNING') || norm.includes('STATUS')) {
    return {
      label: action,
      bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      dot: 'bg-amber-400',
    };
  }
  if (norm.includes('LOGIN') || norm.includes('PASSWORD')) {
    return {
      label: action,
      bg: 'bg-primary/10 text-primary border-primary/30',
      dot: 'bg-primary',
    };
  }
  return {
    label: action,
    bg: 'bg-surface-container-high text-on-surface-variant border-outline-variant/30',
    dot: 'bg-on-surface-variant',
  };
}

function getStatusBadge(status: string) {
  const s = status.toLowerCase();
  switch (s) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Success
        </span>
      );
    case 'warning':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <span className="size-1.5 rounded-full bg-amber-400" />
          Warning
        </span>
      );
    case 'critical':
    case 'failure':
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-error-container/40 text-error border border-error/30">
          <span className="size-1.5 rounded-full bg-error" />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
          <span className="size-1.5 rounded-full bg-on-surface-variant" />
          {status}
        </span>
      );
  }
}

export function AuditLogsPage() {
  const dispatch = useAppDispatch();
  const { items, total, total_pages, summary, selectedLog, isLoading, isExporting, error } =
    useAppSelector((state) => state.auditLogs);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AuditLogCategory>('all');
  const [statusFilter, setStatusFilter] = useState<AuditLogStatus>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [copiedJson, setCopiedJson] = useState(false);

  // Debounce search
  useEffect(() => {
    if (searchTerm.trim() === debouncedSearch) return;
    const timer = setTimeout(() => {
      // A new search starts again from page 1
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  // A new filter starts again from page 1
  const changeCategoryFilter = (value: AuditLogCategory) => {
    setCategoryFilter(value);
    setPage(1);
  };
  const changeStatusFilter = (value: AuditLogStatus) => {
    setStatusFilter(value);
    setPage(1);
  };

  // Fetch audit logs
  useEffect(() => {
    dispatch(
      fetchAuditLogs({
        page,
        page_size: pageSize,
        search: debouncedSearch || undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    );
  }, [dispatch, page, pageSize, debouncedSearch, categoryFilter, statusFilter]);

  const handleRefresh = () => {
    dispatch(
      fetchAuditLogs({
        page,
        page_size: pageSize,
        search: debouncedSearch || undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    );
  };

  const handleExportCsv = () => {
    dispatch(
      exportAuditLogsCsv({
        search: debouncedSearch || undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    );
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const handleCopyDetails = (details: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(details, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const totalPages = Math.max(1, total_pages || 1);
  const pageNumbers = useMemo(() => getPageNumbers(page, totalPages), [page, totalPages]);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const isFiltered = Boolean(debouncedSearch || categoryFilter !== 'all' || statusFilter !== 'all');

  return (
    <Container>
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-3 border border-outline-variant/30">
            <ShieldCheck className="size-3.5" />
            Super Admin · Compliance & Security
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">Audit Logs</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Immutable system audit trail tracking workspace provisioning, administrative changes, and security events.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            disabled={isExporting}
            className="shrink-0"
          >
            {isExporting ? (
              <RefreshCw className="size-4 animate-spin text-primary" />
            ) : (
              <Download className="size-4" />
            )}
            Export CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="shrink-0"
            title="Refresh audit logs"
          >
            <RefreshCw className={clsx('size-4', isLoading && 'animate-spin text-primary')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-5 flex items-start justify-between border-outline-variant/30 bg-surface-container-lowest/60">
          <div>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              Total Logged Events
            </p>
            <p className="text-3xl font-extrabold text-on-surface mt-2">
              {summary ? summary.total_events.toLocaleString() : '—'}
            </p>
            <p className="text-[11px] text-on-surface-variant mt-1">Platform audit records</p>
          </div>
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <ScrollText className="size-5" />
          </div>
        </Card>

        <Card className="p-5 flex items-start justify-between border-outline-variant/30 bg-surface-container-lowest/60">
          <div>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              Workspace Operations
            </p>
            <p className="text-3xl font-extrabold text-on-surface mt-2">
              {summary ? summary.org_events.toLocaleString() : '—'}
            </p>
            <p className="text-[11px] text-on-surface-variant mt-1">Creations, status & updates</p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Building2 className="size-5" />
          </div>
        </Card>

        <Card className="p-5 flex items-start justify-between border-outline-variant/30 bg-surface-container-lowest/60">
          <div>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              Security & Auth
            </p>
            <p className="text-3xl font-extrabold text-on-surface mt-2">
              {summary ? summary.security_events.toLocaleString() : '—'}
            </p>
            <p className="text-[11px] text-on-surface-variant mt-1">Logins & password rotations</p>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <ShieldCheck className="size-5" />
          </div>
        </Card>

        <Card className="p-5 flex items-start justify-between border-outline-variant/30 bg-surface-container-lowest/60">
          <div>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              Critical Actions
            </p>
            <p className="text-3xl font-extrabold text-on-surface mt-2 text-error">
              {summary ? summary.critical_events.toLocaleString() : '—'}
            </p>
            <p className="text-[11px] text-on-surface-variant mt-1">Deletions, revokes & failures</p>
          </div>
          <div className="p-2.5 rounded-xl bg-error/10 text-error border border-error/20">
            <AlertTriangle className="size-5" />
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 mb-6 border-outline-variant/30 bg-surface-container-lowest/80 backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-on-surface-variant pointer-events-none" />
            <input
              type="text"
              placeholder="Search by actor email, target workspace, or action name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-surface-container text-sm text-on-surface placeholder:text-on-surface-variant/60 border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
            {CATEGORIES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => changeCategoryFilter(value)}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition border',
                  categoryFilter === value
                    ? 'bg-primary text-on-primary border-primary shadow-sm'
                    : 'bg-surface-container-low text-on-surface-variant border-outline-variant/20 hover:text-on-surface hover:bg-surface-container',
                )}
              >
                <Icon className="size-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Status Dropdown & Clear */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => changeStatusFilter(e.target.value as AuditLogStatus)}
              className="px-3 py-1.5 rounded-lg bg-surface-container text-xs font-semibold text-on-surface border border-outline-variant/40 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {STATUSES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-xs text-on-surface-variant hover:text-error"
              >
                <X className="size-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-error-container/30 border border-error/30 text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            Retry
          </Button>
        </div>
      )}

      {/* Main Audit Logs Table */}
      <Card className="overflow-hidden border-outline-variant/30 bg-surface-container-lowest/90">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-container-high bg-surface-container-low/50 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                <th className="py-3.5 px-4">Timestamp (UTC)</th>
                <th className="py-3.5 px-4">Actor</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Target Resource</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">IP Address</th>
                <th className="py-3.5 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high/60 text-sm">
              {isLoading && items.length === 0 ? (
                // Skeleton Loader
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-4">
                      <div className="h-4 w-32 bg-surface-container-high rounded" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 w-40 bg-surface-container-high rounded" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-5 w-28 bg-surface-container-high rounded-full" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 w-20 bg-surface-container-high rounded" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 w-28 bg-surface-container-high rounded" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 w-16 bg-surface-container-high rounded-full" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 w-20 bg-surface-container-high rounded" />
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="h-6 w-12 bg-surface-container-high rounded ml-auto" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="mx-auto size-12 rounded-2xl bg-surface-container-high/60 flex items-center justify-center text-on-surface-variant mb-3">
                      <ScrollText className="size-6" />
                    </div>
                    <p className="text-base font-semibold text-on-surface">No audit events found</p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {isFiltered
                        ? 'Try clearing or modifying your filter criteria.'
                        : 'Audit records will appear here as administrators interact with the platform.'}
                    </p>
                    {isFiltered && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleClearFilters}
                        className="mt-4"
                      >
                        Reset filters
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                items.map((log) => {
                  const { formatted, relative } = formatTimestamp(log.created_at);
                  const badge = getActionBadge(log.action);
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-surface-container-low/60 transition-colors group"
                    >
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono text-xs text-on-surface font-medium">
                          {formatted}
                        </div>
                        {relative && (
                          <div className="text-[11px] text-on-surface-variant/70">{relative}</div>
                        )}
                      </td>

                      {/* Actor */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold border border-primary/20 shrink-0">
                            {log.actor_email ? log.actor_email.charAt(0).toUpperCase() : 'A'}
                          </div>
                          <div>
                            <p className="font-medium text-xs text-on-surface truncate max-w-[180px]">
                              {log.actor_email}
                            </p>
                            <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider bg-surface-container text-on-surface-variant border border-outline-variant/30">
                              {log.actor_type.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold border',
                            badge.bg,
                          )}
                        >
                          <span className={clsx('size-1.5 rounded-full', badge.dot)} />
                          {log.action}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-container text-on-surface-variant border border-outline-variant/30">
                          {log.category}
                        </span>
                      </td>

                      {/* Target */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {log.target_name ? (
                          <div>
                            <span className="text-xs font-semibold text-on-surface">
                              {log.target_name}
                            </span>
                            {log.target_type && (
                              <span className="block text-[11px] text-on-surface-variant">
                                Type: {log.target_type}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-on-surface-variant/60">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusBadge(log.status)}
                      </td>

                      {/* IP Address */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono text-xs text-on-surface-variant bg-surface-container-low px-2 py-1 rounded border border-outline-variant/20">
                          {log.ip_address || '—'}
                        </span>
                      </td>

                      {/* Details / Inspect */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => dispatch(setSelectedLog(log))}
                          className="text-xs text-primary hover:bg-primary/10 h-8 px-2.5"
                        >
                          <Eye className="size-3.5 mr-1" />
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 border-t border-surface-container-high bg-surface-container-low/40">
          <div className="flex items-center gap-3 text-xs text-on-surface-variant">
            <span>
              Showing <strong className="text-on-surface">{from}</strong> to{' '}
              <strong className="text-on-surface">{to}</strong> of{' '}
              <strong className="text-on-surface">{total}</strong> events
            </span>
            <div className="h-3 w-px bg-surface-container-high hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-0.5 rounded bg-surface-container text-xs text-on-surface border border-outline-variant/40 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1 self-end sm:self-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage(1)}
              disabled={page <= 1 || isLoading}
              aria-label="First page"
              className="size-8"
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              aria-label="Previous page"
              className="size-8"
            >
              <ChevronLeft className="size-4" />
            </Button>

            <div className="flex items-center gap-1 mx-1">
              {pageNumbers.map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="px-2 text-xs text-on-surface-variant">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    disabled={isLoading}
                    className={clsx(
                      'size-8 rounded-lg text-xs font-semibold transition',
                      p === page
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high',
                    )}
                  >
                    {p}
                  </button>
                ),
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              aria-label="Next page"
              className="size-8"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages || isLoading}
              aria-label="Last page"
              className="size-8"
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Detail Slide-out Drawer / Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full max-w-xl h-full bg-surface-container-lowest border-l border-surface-container-high shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
            role="dialog"
            aria-modal="true"
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-surface-container-high flex items-start justify-between gap-4 bg-surface-container-low/40">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant/30">
                    Event #{selectedLog.id}
                  </span>
                  {getStatusBadge(selectedLog.status)}
                </div>
                <h3 className="text-lg font-bold text-on-surface font-mono">{selectedLog.action}</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Category: <span className="font-semibold text-on-surface">{selectedLog.category}</span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => dispatch(setSelectedLog(null))}
                aria-label="Close details"
              >
                <X className="size-5" />
              </Button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Event Metadata Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider block mb-1">
                    Actor
                  </span>
                  <p className="text-xs font-bold text-on-surface truncate">{selectedLog.actor_email}</p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Role: {selectedLog.actor_type}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20">
                  <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider block mb-1">
                    Client IP & Time
                  </span>
                  <p className="text-xs font-mono font-bold text-on-surface">
                    {selectedLog.ip_address || 'Unknown IP'}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    {formatTimestamp(selectedLog.created_at).formatted}
                  </p>
                </div>
              </div>

              {/* Target Resource */}
              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider block mb-2">
                  Target Resource
                </span>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[11px] text-on-surface-variant">Resource Type:</span>
                    <p className="font-semibold text-on-surface mt-0.5">
                      {selectedLog.target_type || '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-on-surface-variant">Target Name:</span>
                    <p className="font-semibold text-on-surface mt-0.5">
                      {selectedLog.target_name || '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-on-surface-variant">Target ID:</span>
                    <p className="font-semibold text-on-surface mt-0.5">
                      {selectedLog.target_id ?? '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Context Details JSON */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                    Context Parameters & Payload
                  </span>
                  {selectedLog.details && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyDetails(selectedLog.details)}
                      className="text-xs h-7 px-2"
                    >
                      {copiedJson ? (
                        <>
                          <Check className="size-3 text-emerald-400 mr-1" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3 mr-1" />
                          Copy JSON
                        </>
                      )}
                    </Button>
                  )}
                </div>

                <div className="rounded-xl bg-surface-container-highest/60 border border-outline-variant/30 p-4 overflow-x-auto">
                  {selectedLog.details && Object.keys(selectedLog.details).length > 0 ? (
                    <pre className="text-xs font-mono text-on-surface leading-relaxed whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-xs text-on-surface-variant italic">No payload parameters recorded.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-surface-container-high bg-surface-container-low/40 flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => dispatch(setSelectedLog(null))}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
