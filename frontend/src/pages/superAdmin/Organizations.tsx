import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card, Container } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchOrganizations } from '@/store/superAdmin/organizationThunks';

type StatusFilterType = 'all' | 'active' | 'inactive';

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

export function OrganizationListPage() {
  const dispatch = useAppDispatch();
  const { list, total, total_pages, isLoading, error } = useAppSelector(
    (state) => state.organizations,
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Debounce search term changes (300ms)
  useEffect(() => {
    if (searchTerm.trim() === debouncedSearch) return;
    const timer = setTimeout(() => {
      // A new search starts again from page 1
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  // A new status filter starts again from page 1
  const changeStatusFilter = (value: StatusFilterType) => {
    setStatusFilter(value);
    setPage(1);
  };

  // Fetch organizations on query / filter / pagination updates
  useEffect(() => {
    dispatch(
      fetchOrganizations({
        page,
        page_size: pageSize,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    );
  }, [dispatch, page, pageSize, debouncedSearch, statusFilter]);

  const handleRefresh = () => {
    dispatch(
      fetchOrganizations({
        page,
        page_size: pageSize,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    );
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setStatusFilter('all');
    setPage(1);
  };

  const totalPages = Math.max(1, total_pages || 1);
  const pageNumbers = useMemo(() => getPageNumbers(page, totalPages), [page, totalPages]);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const isFiltered = Boolean(debouncedSearch || statusFilter !== 'all');

  return (
    <Container>
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-3 border border-outline-variant/30">
            <Building2 className="size-3.5" />
            Super Admin · Workspaces
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">Organizations</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Manage client workspaces, subscription statuses, and primary administrator accounts.
          </p>
        </div>
        <Link to="/admin/organizations/new">
          <Button variant="primary" className="glow-primary shrink-0">
            <Plus className="size-4" />
            Create organization
          </Button>
        </Link>
      </div>

      {/* Search, Filter & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        {/* Search input with clear button */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-on-surface-variant/50 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, slug, or admin email..."
            className="w-full pl-10 pr-9 py-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setDebouncedSearch('');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface transition-colors p-1 rounded-full hover:bg-surface-container-low"
              title="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Status segmented filters & refresh button */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="inline-flex items-center p-1 bg-surface-container-low border border-outline-variant/30 rounded-xl">
            {(['all', 'active', 'inactive'] as const).map((status) => {
              const isSelected = statusFilter === status;
              const labels: Record<StatusFilterType, string> = {
                all: 'All',
                active: 'Active',
                inactive: 'Inactive',
              };
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => changeStatusFilter(status)}
                  className={clsx(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize flex items-center gap-1.5 cursor-pointer',
                    isSelected
                      ? 'bg-surface-container-lowest text-primary shadow-xs font-bold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50',
                  )}
                >
                  {status === 'active' && <span className="size-1.5 rounded-full bg-emerald-500" />}
                  {status === 'inactive' && <span className="size-1.5 rounded-full bg-amber-500" />}
                  {labels[status]}
                </button>
              );
            })}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh list"
            className="p-2 h-9 w-9"
          >
            <RefreshCw className={clsx('size-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Error notification banner */}
      {error && (
        <div className="mb-6 rounded-xl bg-error-container text-on-error-container text-sm px-4 py-3 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            Retry
          </Button>
        </div>
      )}

      {/* Content Area */}
      {isLoading ? (
        /* Loading skeleton rows */
        <div className="space-y-3">
          {Array.from({ length: pageSize > 6 ? 6 : pageSize }).map((_, i) => (
            <Card key={i} className="p-4 sm:p-5 animate-pulse flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="size-11 rounded-xl bg-surface-container-low shrink-0" />
                <div className="space-y-2">
                  <div className="h-4 w-36 bg-surface-container-low rounded" />
                  <div className="h-3 w-20 bg-surface-container-low rounded" />
                </div>
              </div>
              <div className="hidden md:flex items-center gap-12">
                <div className="space-y-1.5">
                  <div className="h-3 w-28 bg-surface-container-low rounded" />
                  <div className="h-3 w-36 bg-surface-container-low rounded" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-24 bg-surface-container-low rounded" />
                  <div className="h-3 w-28 bg-surface-container-low rounded" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-6 w-16 bg-surface-container-low rounded-full" />
                <div className="h-8 w-20 bg-surface-container-low rounded-lg" />
              </div>
            </Card>
          ))}
        </div>
      ) : list.length === 0 ? (
        /* Empty states */
        <Card className="p-12 text-center">
          <div className="size-12 rounded-2xl bg-surface-container-low text-on-surface-variant flex items-center justify-center mx-auto mb-4 border border-outline-variant/30">
            {isFiltered ? <Filter className="size-6 text-outline" /> : <Building2 className="size-6 text-primary" />}
          </div>
          <h3 className="text-base font-bold text-on-surface mb-1">
            {isFiltered ? 'No matching organizations' : 'No organizations yet'}
          </h3>
          <p className="text-sm text-on-surface-variant mb-6 max-w-sm mx-auto">
            {isFiltered
              ? 'We couldn’t find any organizations matching your current search or status filter criteria.'
              : 'Provision your first workspace organization and administrator account.'}
          </p>
          {isFiltered ? (
            <Button variant="secondary" onClick={handleClearFilters}>
              Clear filters
            </Button>
          ) : (
            <Link to="/admin/organizations/new">
              <Button variant="primary">Create the first organization</Button>
            </Link>
          )}
        </Card>
      ) : (
        /* Organization Long Horizontal Listing */
        <div className="space-y-3">
          {list.map((org) => {
            const isActive = org.subscription_status === 'active';
            return (
              <Link
                key={org.id}
                to={`/admin/organizations/${org.id}`}
                className="group block"
              >
                <Card
                  variant="feature"
                  className="p-4 sm:p-5 hover:border-primary/50 hover:bg-surface-container-low/20 transition-all duration-200"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Avatar, Name & Slug */}
                    <div className="flex items-center gap-3.5 min-w-[240px] max-w-xs">
                      <div className="size-11 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-base shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                        {org.name[0]?.toUpperCase() || 'O'}
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-on-surface truncate group-hover:text-primary transition-colors text-sm sm:text-base">
                          {org.name}
                        </h2>
                        <span className="text-[11px] font-mono text-on-surface-variant/80 truncate block mt-0.5">
                          {org.slug}
                        </span>
                      </div>
                    </div>

                    {/* Middle Column 1: Primary Admin */}
                    <div className="min-w-[190px] text-xs">
                      <div className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <User className="size-3 text-outline" />
                        Admin
                      </div>
                      <div className="font-semibold text-on-surface truncate">
                        {org.admin_name || 'Unassigned'}
                      </div>
                      <div className="text-on-surface-variant text-[11px] truncate">
                        {org.admin_email || '—'}
                      </div>
                    </div>

                    {/* Middle Column 2: Support Contact */}
                    <div className="min-w-[190px] text-xs hidden sm:block">
                      <div className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Mail className="size-3 text-outline" />
                        Support Contact
                      </div>
                      <div className="text-on-surface font-medium truncate">
                        {org.support_email || '—'}
                      </div>
                      <div className="text-on-surface-variant text-[11px] truncate flex items-center gap-1">
                        {org.support_phone ? (
                          <>
                            <Phone className="size-2.5 text-outline" />
                            <span>{org.support_phone}</span>
                          </>
                        ) : (
                          <span>No phone</span>
                        )}
                      </div>
                    </div>

                    {/* Middle Column 3: Team Members */}
                    <div className="min-w-[90px] text-xs">
                      <div className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Users className="size-3 text-outline" />
                        Team
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold text-on-surface">
                        <span>{org.user_count}</span>
                        <span className="text-on-surface-variant font-normal text-[11px]">
                          {org.user_count === 1 ? 'member' : 'members'}
                        </span>
                      </div>
                    </div>

                    {/* Right: Status Badge & Manage Action */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-outline-variant/15">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/25">
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/25">
                          <span className="size-1.5 rounded-full bg-amber-500" />
                          Inactive
                        </span>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        className="group-hover:bg-primary group-hover:text-on-primary group-hover:border-primary transition-all duration-200 text-xs flex items-center gap-1.5 px-3 py-1.5 cursor-pointer shadow-xs"
                      >
                        <span>Manage</span>
                        <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {total > 0 && (
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-surface-container-lowest border border-outline-variant/30 rounded-xl">
          {/* Summary and Page Size Selector */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
            <span>
              Showing <strong className="text-on-surface font-semibold">{from}</strong> to{' '}
              <strong className="text-on-surface font-semibold">{to}</strong> of{' '}
              <strong className="text-on-surface font-semibold">{total}</strong> organizations
            </span>

            <span className="text-outline-variant">|</span>

            <div className="flex items-center gap-1.5">
              <label htmlFor="pageSizeSelect" className="text-xs font-medium">
                Per page:
              </label>
              <select
                id="pageSizeSelect"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-surface-container-low border border-outline-variant/40 rounded-lg px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page === 1 || isLoading}
              aria-label="First page"
              className="p-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronsLeft className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
              aria-label="Previous page"
              className="p-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft className="size-4" />
            </button>

            {/* Page number buttons */}
            <div className="hidden sm:flex items-center gap-1 px-1">
              {pageNumbers.map((p, idx) => {
                if (p === '...') {
                  return (
                    <span key={`dots-${idx}`} className="px-2 text-xs text-on-surface-variant/50">
                      …
                    </span>
                  );
                }
                const isCurrent = p === page;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    disabled={isLoading}
                    className={clsx(
                      'min-w-8 h-8 px-2 text-xs font-semibold rounded-lg transition-all cursor-pointer',
                      isCurrent
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low border border-outline-variant/20',
                    )}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <span className="sm:hidden text-xs text-on-surface-variant font-medium px-2">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              aria-label="Next page"
              className="p-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronRight className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages || isLoading}
              aria-label="Last page"
              className="p-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronsRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </Container>
  );
}
