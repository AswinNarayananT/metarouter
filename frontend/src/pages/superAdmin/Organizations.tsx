import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Plus, Search } from 'lucide-react';
import { Card, Container } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchOrganizations } from '@/store/superAdmin/organizationThunks';

export function OrganizationListPage() {
  const dispatch = useAppDispatch();
  const { list, isLoading, error } = useAppSelector((state) => state.organizations);
  const [query, setQuery] = useState('');

  useEffect(() => {
    dispatch(fetchOrganizations());
  }, [dispatch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((org) =>
      [org.name, org.slug, org.admin_email, org.support_email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [list, query]);

  return (
    <Container>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-4 border border-outline-variant/30">
            <Building2 className="size-3.5" />
            Organizations
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">Organizations</h1>
          <p className="mt-2 text-on-surface-variant">Every client workspace and its primary admin account.</p>
        </div>
        <Link to="/admin/organizations/new">
          <Button variant="primary" className="glow-primary">
            <Plus className="size-4" />
            Create organization
          </Button>
        </Link>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-on-surface-variant/60" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, slug, or email"
          className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-outline/30 rounded-xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
        />
      </div>

      {error && (
        <div className="mb-6 rounded-xl bg-error-container text-on-error-container text-sm px-4 py-3">{error}</div>
      )}

      {isLoading ? (
        <Card className="p-8 text-sm text-on-surface-variant">Loading organizations…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-on-surface-variant mb-4">
            {query ? 'No organizations match that search.' : 'No organizations have been provisioned yet.'}
          </p>
          {!query && (
            <Link to="/admin/organizations/new">
              <Button variant="primary">Create the first organization</Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((org) => (
            <Link key={org.id} to={`/admin/organizations/${org.id}`}>
              <Card variant="feature" className="p-5 h-full">
                <div className="flex items-start gap-4">
                  <div className="size-12 rounded-xl bg-surface-container-low text-primary border border-outline-variant/30 flex items-center justify-center font-bold shrink-0">
                    {org.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="font-semibold text-on-surface truncate">{org.name}</h2>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container-low text-primary border border-outline-variant/30">
                        {org.subscription_status}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-on-surface-variant truncate">{org.slug}</p>
                    <p className="mt-3 text-sm text-on-surface-variant truncate">
                      Admin · {org.admin_name || 'Unassigned'} ({org.admin_email || '—'})
                    </p>
                    <p className="text-xs text-outline mt-1">{org.user_count} users</p>
                  </div>
                  <ArrowRight className="size-4 text-outline mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
