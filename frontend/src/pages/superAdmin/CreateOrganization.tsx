import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { AlertCircle, Building2, CheckCircle2, Clock, Mail, RotateCw, ShieldCheck, Trash2 } from 'lucide-react';
import { Card, Container } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAppDispatch, useAppSelector } from '@/store';
import { createOrganizationInvite, fetchOrganizationInvites, revokeOrganizationInvite } from '@/store/superAdmin/organizationThunks';
import { clearOrganizationError, clearLastInvitation } from '@/store/superAdmin/organizationSlice';
import { emailField, fieldError } from '@/validation/schemas';
import type { OrganizationInvitation } from '@/types/organizationTypes';

interface InviteFormValues {
  email: string;
  organization_name: string;
  expires_in_days: number;
}

const inviteSchema = Yup.object({
  email: emailField('Client admin email'),
  organization_name: Yup.string().trim().max(120, 'Organization name must be 120 characters or less'),
  expires_in_days: Yup.number().required().min(1).max(30),
});

const EXPIRY_OPTIONS = [
  { label: '24 Hours', days: 1 },
  { label: '3 Days', days: 3 },
  { label: '7 Days', days: 7 },
];

const inputClass =
  'w-full px-4 py-2.5 bg-surface border rounded-xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 text-sm transition-all';

function borderClass(hasError: boolean) {
  return hasError
    ? 'border-error focus:border-error focus:ring-error'
    : 'border-outline/30 focus:border-primary focus:ring-primary';
}

const labelClass = 'block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5';

function FieldMessage({ error }: { error?: string }) {
  return error ? <p className="mt-1 text-xs text-error">{error}</p> : null;
}

/**
 * New organization = an emailed invitation. The client admin opens the link, names the workspace and sets their
 * own password; the super admin never sees the password or the link (the server stores only a hash of it).
 */
export function CreateOrganizationPage() {
  const dispatch = useAppDispatch();
  const { isInviting, lastInvitation, invitations, error } = useAppSelector((state) => state.organizations);
  const [resendingId, setResendingId] = useState<number | null>(null);
  // Expiry is judged against when the page was opened (render must not read the clock)
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    dispatch(clearOrganizationError());
    dispatch(clearLastInvitation());
    dispatch(fetchOrganizationInvites());
  }, [dispatch]);

  const inviteFormik = useFormik<InviteFormValues>({
    initialValues: { email: '', organization_name: '', expires_in_days: 3 },
    validationSchema: inviteSchema,
    onSubmit: async (values, { resetForm }) => {
      dispatch(clearOrganizationError());
      const result = await dispatch(
        createOrganizationInvite({
          email: values.email.trim(),
          organization_name: values.organization_name.trim() || undefined,
          expires_in_days: Number(values.expires_in_days),
        })
      );
      if (createOrganizationInvite.fulfilled.match(result)) resetForm();
    },
  });

  // Resend = a fresh link emailed to the same address (the old link stops working)
  const resend = async (invite: OrganizationInvitation) => {
    setResendingId(invite.id);
    dispatch(clearOrganizationError());
    await dispatch(
      createOrganizationInvite({
        email: invite.email,
        organization_name: invite.organization_name || undefined,
        expires_in_days: 3,
      })
    );
    setResendingId(null);
  };

  const isInviteExpired = (invite: OrganizationInvitation) => new Date(invite.expires_at).getTime() < openedAt;

  return (
    <Container size="md">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-3 border border-outline-variant/30">
          <Building2 className="size-3.5" />
          Workspace Management
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">New Organization</h1>
        <p className="mt-1.5 text-sm text-on-surface-variant">
          Invite the client's administrator by email. They set up the workspace and choose their own password.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3.5 rounded-xl bg-error/10 border border-error/20 text-error text-sm flex items-center gap-2.5">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-8">
        {/* Sent: the link went to the admin's inbox, nothing to copy here */}
        {lastInvitation && (
          <Card variant="default" className="p-6 bg-primary/5 border-primary/30 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <CheckCircle2 className="size-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-on-surface">Invitation emailed</h3>
                <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                  A setup link was sent to <strong>{lastInvitation.email}</strong>. It works once and expires on{' '}
                  {new Date(lastInvitation.expires_at).toLocaleDateString()}. If it doesn't arrive, use <strong>Resend</strong> below.
                </p>
              </div>
            </div>
            <div className="flex justify-end text-[11px] pt-1 border-t border-primary/10">
              <button type="button" onClick={() => dispatch(clearLastInvitation())} className="text-primary hover:underline font-medium cursor-pointer">
                Invite another client
              </button>
            </div>
          </Card>
        )}

        <Card variant="form" className="p-6 sm:p-8">
          <div className="mb-6 space-y-1">
            <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
              <Mail className="size-4 text-primary" />
              <span>Client Administrator Invitation</span>
            </h2>
            <p className="text-xs text-on-surface-variant">We'll email them a single-use setup link.</p>
          </div>

          <form onSubmit={inviteFormik.handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="invite-email" className={labelClass}>
                Client Admin Email <span className="text-error">*</span>
              </label>
              <div className="relative">
                <input
                  id="invite-email"
                  type="email"
                  placeholder="client.admin@company.com"
                  aria-invalid={!!fieldError(inviteFormik, 'email')}
                  {...inviteFormik.getFieldProps('email')}
                  className={`${inputClass} ${borderClass(!!fieldError(inviteFormik, 'email'))} pl-10`}
                />
                <Mail className="size-4 text-on-surface-variant/50 absolute left-3.5 top-3 pointer-events-none" />
              </div>
              <FieldMessage error={fieldError(inviteFormik, 'email')} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="invite-org-name" className={labelClass}>
                  Organization Name (Optional Hint)
                </label>
                <span className="text-[10px] text-on-surface-variant/70">Client can change this on setup</span>
              </div>
              <div className="relative">
                <input
                  id="invite-org-name"
                  type="text"
                  placeholder="e.g. Acme Corporation"
                  aria-invalid={!!fieldError(inviteFormik, 'organization_name')}
                  {...inviteFormik.getFieldProps('organization_name')}
                  className={`${inputClass} ${borderClass(!!fieldError(inviteFormik, 'organization_name'))} pl-10`}
                />
                <Building2 className="size-4 text-on-surface-variant/50 absolute left-3.5 top-3 pointer-events-none" />
              </div>
              <FieldMessage error={fieldError(inviteFormik, 'organization_name')} />
            </div>

            <div>
              <label className={labelClass}>Link Expiration</label>
              <div className="grid grid-cols-3 gap-3">
                {EXPIRY_OPTIONS.map((option) => (
                  <button
                    key={option.days}
                    type="button"
                    onClick={() => inviteFormik.setFieldValue('expires_in_days', option.days)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      inviteFormik.values.expires_in_days === option.days
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-outline-variant/40 bg-surface text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <Clock className="size-3.5" />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3.5 bg-surface rounded-xl border border-outline-variant/30 flex items-start gap-2.5">
              <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                The administrator sets their own password through the emailed link. Super admins never see their password or the link,
                and modules can be switched on per workspace from its detail page once it's set up.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button type="submit" variant="primary" loading={isInviting && resendingId === null} className="glow-primary flex-1">
                <Mail className="size-4 mr-1.5" />
                Send Invitation
              </Button>
              <Link to="/admin/organizations" className="sm:w-auto">
                <Button type="button" variant="secondary" className="w-full">
                  View Organizations
                </Button>
              </Link>
            </div>
          </form>
        </Card>

        {invitations.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">Recent Workspace Invitations ({invitations.length})</h3>

            <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden divide-y divide-outline-variant/20 shadow-xs">
              {invitations.map((inv) => {
                const expired = isInviteExpired(inv);
                return (
                  <div
                    key={inv.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-container/50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-on-surface">{inv.email}</span>
                        {inv.is_used ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            Activated
                          </span>
                        ) : expired ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-error/10 text-error border border-error/20">Expired</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            Pending
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-on-surface-variant flex items-center gap-2">
                        {inv.organization_name ? (
                          <span>
                            Workspace: <strong>{inv.organization_name}</strong>
                          </span>
                        ) : (
                          <span>
                            Workspace: <em>Self-named</em>
                          </span>
                        )}
                        <span>•</span>
                        <span>Expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!inv.is_used && (
                        <button
                          type="button"
                          onClick={() => resend(inv)}
                          disabled={resendingId === inv.id}
                          title="Email a fresh link (the old one stops working)"
                          className="px-3 py-1.5 rounded-lg border border-outline-variant/40 bg-surface hover:bg-surface-container text-xs font-medium text-on-surface flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                        >
                          <RotateCw className={`size-3.5 text-on-surface-variant ${resendingId === inv.id ? 'animate-spin' : ''}`} />
                          <span>{resendingId === inv.id ? 'Sending…' : 'Resend'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => dispatch(revokeOrganizationInvite(inv.id))}
                        title="Revoke invitation"
                        className="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
