import { useEffect, useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Check, Copy, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchInvitations, generateWorkspaceInvitations } from '@/store/workspace/workspaceThunks';
import { resetInviteState, clearWorkspaceError } from '@/store/workspace/workspaceSlice';
import type { InvitationStatus } from '@/types/workspaceTypes';
import { emailField, nameField } from '@/validation/schemas';

const INVITATIONS_PAGE_SIZE = 10;

const STATUS_FILTERS: { label: string; value: InvitationStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Pending', value: 'pending' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Expired', value: 'expired' },
];

const STATUS_BADGE_STYLES: Record<InvitationStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-600',
  accepted: 'bg-green-500/10 text-green-600',
  expired: 'bg-error/10 text-error',
};

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

type MemberRole = 'service' | 'manager' | 'admin';

interface MemberInput {
  name: string;
  email: string;
  role: MemberRole;
}

interface InviteFormValues {
  members: MemberInput[];
}

const emptyMember = (): MemberInput => ({ name: '', email: '', role: 'service' });

const inviteSchema = Yup.object({
  members: Yup.array()
    .of(
      Yup.object({
        name: nameField(),
        email: emailField(),
        role: Yup.mixed<MemberRole>()
          .oneOf(['service', 'manager', 'admin'], 'Select a valid role')
          .required('Role is required'),
      })
    )
    .min(1, 'Add at least one member')
    .test('unique-emails', 'Each email can only be invited once', (members) => {
      const emails = (members ?? []).map((m) => m?.email?.trim().toLowerCase()).filter(Boolean);
      return new Set(emails).size === emails.length;
    }),
});

const inputClass =
  'w-full px-3 py-2 rounded-lg border bg-surface text-on-surface text-xs focus:outline-none focus:ring-2';

function borderClass(hasError: boolean) {
  return hasError ? 'border-error focus:ring-error/40' : 'border-outline-variant/50 focus:ring-primary/50';
}

export function InviteMembers() {
  const dispatch = useAppDispatch();
  const { isInviting, inviteSuccess, lastInvitations, user } = useAppSelector((state) => state.workspace);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [submittedCount, setSubmittedCount] = useState(0);

  // Start fresh when entering the page
  useEffect(() => {
    dispatch(resetInviteState());
    dispatch(clearWorkspaceError());
  }, [dispatch]);

  const formik = useFormik<InviteFormValues>({
    initialValues: { members: [emptyMember()] },
    validationSchema: inviteSchema,
    onSubmit: async (values) => {
      dispatch(clearWorkspaceError());
      const members = values.members.map((m) => ({
        name: m.name.trim(),
        email: m.email.trim().toLowerCase(),
        role: m.role,
      }));
      setSubmittedCount(members.length);
      await dispatch(generateWorkspaceInvitations(members));
    },
  });

  const { values, setFieldValue } = formik;

  const handleAddRow = () => {
    setFieldValue('members', [...values.members, emptyMember()]);
  };

  const handleRemoveRow = (index: number) => {
    if (values.members.length === 1) return;
    setFieldValue('members', values.members.filter((_, i) => i !== index));
    // Drop the removed row's touched state so errors don't shift onto the next row
    const touchedMembers = Array.isArray(formik.touched.members) ? formik.touched.members : [];
    formik.setTouched({ ...formik.touched, members: touchedMembers.filter((_, i) => i !== index) }, false);
  };

  const memberError = (index: number, field: keyof MemberInput): string | undefined => {
    const rowErrors = Array.isArray(formik.errors.members) ? formik.errors.members[index] : undefined;
    const rowTouched = Array.isArray(formik.touched.members) ? formik.touched.members[index] : undefined;
    if (!rowErrors || typeof rowErrors === 'string' || !rowTouched?.[field]) return undefined;
    return rowErrors[field];
  };

  // Array-level error (e.g. duplicate emails), shown after a submit attempt
  const listError =
    formik.submitCount > 0 && typeof formik.errors.members === 'string' ? formik.errors.members : undefined;

  const handleCopyLink = (link: string, index: number) => {
    navigator.clipboard.writeText(link);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 3000);
  };

  const handleReset = () => {
    dispatch(resetInviteState());
    dispatch(clearWorkspaceError());
    formik.resetForm();
    setCopiedIndex(null);
  };

  const skippedCount = Math.max(0, submittedCount - lastInvitations.length);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Invite Team Members</h1>
        <p className="text-sm text-on-surface-variant">Generate secure invite links for new team members.</p>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-xl p-6 space-y-6">
        {/* Form problems (e.g. duplicate emails); a failed send shows as a toast */}
        {listError && (
          <div role="alert" className="flex items-center gap-2 p-3 bg-error/10 text-error rounded-xl text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{listError}</span>
          </div>
        )}

        {!inviteSuccess ? (
          <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {values.members.map((_, index) => {
                const nameErr = memberError(index, 'name');
                const emailErr = memberError(index, 'email');
                const roleErr = memberError(index, 'role');
                return (
                  <div
                    key={index}
                    className="flex flex-wrap sm:flex-nowrap items-start gap-2 p-3 bg-surface-container/50 border border-outline-variant/30 rounded-xl"
                  >
                    <div className="flex-1 min-w-40 space-y-1">
                      <label
                        htmlFor={`members.${index}.name`}
                        className="block text-[10px] font-medium text-on-surface-variant"
                      >
                        Name
                      </label>
                      <input
                        id={`members.${index}.name`}
                        type="text"
                        placeholder="e.g. Jane Doe"
                        aria-invalid={!!nameErr}
                        {...formik.getFieldProps(`members.${index}.name`)}
                        className={`${inputClass} ${borderClass(!!nameErr)}`}
                      />
                      {nameErr && <p className="text-[10px] text-error">{nameErr}</p>}
                    </div>

                    <div className="flex-1 min-w-40 space-y-1">
                      <label
                        htmlFor={`members.${index}.email`}
                        className="block text-[10px] font-medium text-on-surface-variant"
                      >
                        Email
                      </label>
                      <input
                        id={`members.${index}.email`}
                        type="email"
                        placeholder="jane@company.com"
                        aria-invalid={!!emailErr}
                        {...formik.getFieldProps(`members.${index}.email`)}
                        className={`${inputClass} ${borderClass(!!emailErr)}`}
                      />
                      {emailErr && <p className="text-[10px] text-error">{emailErr}</p>}
                    </div>

                    <div className="w-32 space-y-1">
                      <label
                        htmlFor={`members.${index}.role`}
                        className="block text-[10px] font-medium text-on-surface-variant"
                      >
                        Role
                      </label>
                      <select
                        id={`members.${index}.role`}
                        aria-invalid={!!roleErr}
                        {...formik.getFieldProps(`members.${index}.role`)}
                        className={`${inputClass} ${borderClass(!!roleErr)}`}
                      >
                        <option value="service">Service</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Administrator</option>
                      </select>
                      {roleErr && <p className="text-[10px] text-error">{roleErr}</p>}
                    </div>

                    {values.members.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(index)}
                        aria-label={`Remove member ${index + 1}`}
                        className="mt-5 p-2 text-error hover:bg-error/10 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={handleAddRow}
                className="flex items-center gap-1.5 px-3 py-2 bg-surface-container text-on-surface rounded-xl text-xs font-medium hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another</span>
              </button>

              <button
                type="submit"
                disabled={isInviting}
                className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-medium shadow-md hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {isInviting ? 'Generating...' : 'Generate Invite Links'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
              <p className="text-xs font-medium text-on-surface">Secure Invite Links Generated Successfully!</p>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Copy and share each unique link with the respective member. Each link is valid for 3 days and can only be used once.
              </p>
              {skippedCount > 0 && (
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  {skippedCount} {skippedCount === 1 ? 'person was' : 'people were'} skipped because they
                  already belong to this workspace.
                </p>
              )}

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {lastInvitations.map((invite, index) => (
                  <div key={index} className="p-2.5 bg-surface border border-outline-variant/30 rounded-lg space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-on-surface">{invite.name} <span className="text-[10px] text-on-surface-variant font-normal">({invite.email})</span></span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary uppercase">{invite.role}</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        readOnly
                        value={invite.invite_link}
                        className="w-full bg-surface-container border border-outline-variant/40 rounded-md px-2 py-1 text-[11px] text-on-surface select-all"
                      />
                      <button
                        onClick={() => handleCopyLink(invite.invite_link, index)}
                        className="px-3 py-1 bg-primary text-on-primary rounded-md text-xs font-medium flex items-center gap-1 shrink-0 hover:bg-primary/90 transition-all cursor-pointer"
                      >
                        {copiedIndex === index ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedIndex === index ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-surface-container text-on-surface rounded-xl text-xs font-medium hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                Invite More Members
              </button>
            </div>
          </div>
        )}
      </div>

      {user?.role === 'admin' && <InvitationsList />}
    </div>
  );
}

function InvitationsList() {
  const dispatch = useAppDispatch();
  const { invitations, isLoadingInvitations, invitationsError, inviteSuccess } = useAppSelector(
    (state) => state.workspace
  );
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<InvitationStatus | undefined>(undefined);

  const loadInvitations = () =>
    dispatch(fetchInvitations({ page, page_size: INVITATIONS_PAGE_SIZE, status: statusFilter }));

  useEffect(() => {
    loadInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, page, statusFilter, inviteSuccess]);

  const handleFilterChange = (value: InvitationStatus | undefined) => {
    setStatusFilter(value);
    setPage(1);
  };

  const items = invitations?.items ?? [];
  const totalPages = invitations?.total_pages ?? 1;
  const total = invitations?.total ?? 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * INVITATIONS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * INVITATIONS_PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-on-surface">Invitations</h2>
          <p className="text-sm text-on-surface-variant">Track invitations sent to your workspace.</p>
        </div>
        <div className="flex gap-1 p-1 rounded-full bg-surface-container-low border border-outline-variant/30">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={() => handleFilterChange(filter.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFilter === filter.value
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl overflow-hidden">
        {isLoadingInvitations && !invitations ? (
          <p className="p-6 text-sm text-on-surface-variant text-center">Loading invitations...</p>
        ) : invitationsError ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-error">{invitationsError}</p>
            <button
              type="button"
              onClick={loadInvitations}
              className="text-xs font-medium text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-on-surface-variant text-center">No invitations found.</p>
        ) : (
          <div className={`divide-y divide-outline-variant/30 ${isLoadingInvitations ? 'opacity-60' : ''}`}>
            {items.map((invite) => (
              <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                    {invite.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-on-surface">{invite.name}</h4>
                    <p className="text-xs text-on-surface-variant">{invite.email}</p>
                    <p className="text-[11px] text-on-surface-variant/80">
                      Sent {formatDate(invite.created_at)}
                      {invite.status === 'pending' && ` · Expires ${formatDate(invite.expires_at)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary uppercase">
                    {invite.role}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium uppercase ${STATUS_BADGE_STYLES[invite.status]}`}
                  >
                    {invite.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-outline-variant/30">
            <p className="text-xs text-on-surface-variant">
              Showing {rangeStart}-{rangeEnd} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1 || isLoadingInvitations}
                className="px-3 py-1 rounded-lg text-xs font-medium border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/5"
              >
                Previous
              </button>
              <span className="text-xs text-on-surface-variant">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages || isLoadingInvitations}
                className="px-3 py-1 rounded-lg text-xs font-medium border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/5"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
