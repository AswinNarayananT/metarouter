import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, KeyRound, ShieldCheck } from 'lucide-react';
import { Card, Container } from '@/components/Card';
import { Button } from '@/components/Button';
import { CopyField } from '@/components/superadmin/CopyField';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchOrganization } from '@/store/superAdmin/organizationThunks';

interface LocationState {
  adminPassword?: string;
  justCreated?: boolean;
}

function passwordKey(id: string | undefined) {
  return id ? `org_admin_password_${id}` : '';
}

export function OrganizationDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { current, isLoading, error } = useAppSelector((state) => state.organizations);
  const [bundleCopied, setBundleCopied] = useState(false);

  const navState = (location.state || {}) as LocationState;
  const storedPassword = id ? sessionStorage.getItem(passwordKey(id)) : null;
  const adminPassword = navState.adminPassword || storedPassword || '';

  useEffect(() => {
    if (id) dispatch(fetchOrganization(Number(id)));
  }, [dispatch, id]);

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
    if (adminPassword) {
      lines.push(`Admin password: ${adminPassword}`);
    }
    lines.push(`Workspace login: ${window.location.origin}/login`);
    return lines.join('\n');
  }, [current, adminPassword]);

  async function copyBundle() {
    if (!credentialBundle) return;
    await navigator.clipboard.writeText(credentialBundle);
    setBundleCopied(true);
    window.setTimeout(() => setBundleCopied(false), 1800);
  }

  if (isLoading && !current) {
    return (
      <Container size="md">
        <Card className="p-8 text-sm text-on-surface-variant">Loading organization…</Card>
      </Container>
    );
  }

  if (error || !current) {
    return (
      <Container size="md">
        <Card className="p-8 text-center space-y-4">
          <p className="text-sm text-on-surface-variant">{error || 'Organization not found.'}</p>
          <Link to="/admin/organizations">
            <Button variant="secondary">Back to organizations</Button>
          </Link>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="md">
      <Link
        to="/admin/organizations"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary mb-6"
      >
        <ArrowLeft className="size-4" />
        All organizations
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-4 border border-outline-variant/30">
            <ShieldCheck className="size-3.5" />
            Tenant workspace
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">{current.name}</h1>
          <p className="mt-1 font-mono text-sm text-on-surface-variant">{current.slug}</p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-surface-container-low text-primary border border-outline-variant/30 w-fit">
          {current.subscription_status}
        </span>
      </div>

      {navState.justCreated && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary-fixed/30 px-4 py-3 text-sm text-on-primary-fixed">
          Organization created. Copy the admin password now — it is not stored in plaintext after this session.
        </div>
      )}

      <div className="grid gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Organization details</h2>
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
            <CopyField label="Users" value={String(current.user_count)} />
            <CopyField label="WhatsApp numbers" value={String(current.whatsapp_count)} />
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
              {adminPassword ? (
                <CopyField label="Admin password" value={adminPassword} mono />
              ) : (
                <div className="sm:col-span-2 rounded-xl border border-outline-variant/40 bg-surface-container-low/70 px-3 py-3 text-xs text-on-surface-variant">
                  The original admin password is hashed and cannot be retrieved. Copy email and workspace details, or
                  create a new organization admin if credentials were lost.
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">No admin user is attached to this organization.</p>
          )}
        </Card>
      </div>
    </Container>
  );
}
