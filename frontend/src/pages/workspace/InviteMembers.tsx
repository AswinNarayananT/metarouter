import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Check, Copy, AlertCircle, Plus, Trash2, Ban, Loader2, Search, Send, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchInvitations, generateWorkspaceInvitations, resendInvitation, revokeInvitation } from '@/store/workspace/workspaceThunks';
import { resetInviteState, clearWorkspaceError } from '@/store/workspace/workspaceSlice';
import type { InvitationSkipped, InvitationStatus } from '@/types/workspaceTypes';
import { emailField, nameField } from '@/validation/schemas';

const INVITATIONS_PAGE_SIZE = 10;
const MAX_INVITES_PER_REQUEST = 50; // Same cap as the server (invitation_schema.BulkInviteRequest)
const SEARCH_DELAY_MS = 300;

const STATUS_FILTERS: { label: string; value: InvitationStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Pending', value: 'pending' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Expired', value: 'expired' },
  { label: 'Revoked', value: 'revoked' },
];

const STATUS_BADGE_STYLES: Record<InvitationStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-600',
  accepted: 'bg-green-500/10 text-green-600',
  expired: 'bg-error/10 text-error',
  revoked: 'bg-surface-container text-on-surface-variant',
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
  // Emails the server didn't invite, with the reason (shown under that email, or in the "Not invited" list)
  const [skipped, setSkipped] = useState<InvitationSkipped[]>([]);

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
      setSkipped([]);
      const result = await dispatch(generateWorkspaceInvitations(members));
      if (generateWorkspaceInvitations.fulfilled.match(result)) setSkipped(result.payload.skipped);
    },
  });

  // Why the server refused this row's email; shown until the email is changed
  const skippedReason = (index: number): string | undefined =>
    skipped.find((s) => s.email.toLowerCase() === formik.values.members[index]?.email.trim().toLowerCase())?.reason;

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
    setSkipped([]);
  };

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

        {/* Nobody could be invited: the reasons are under the emails */}
        {!inviteSuccess && skipped.length > 0 && (
          <div role="alert" className="flex items-center gap-2 p-3 bg-error/10 text-error rounded-xl text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>No invites were sent. Check the highlighted {skipped.length === 1 ? 'email' : 'emails'}.</span>
          </div>
        )}

        {!inviteSuccess ? (
          <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {values.members.map((_, index) => {
                const nameErr = memberError(index, 'name');
                const emailErr = memberError(index, 'email') || skippedReason(index);
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
                disabled={values.members.length >= MAX_INVITES_PER_REQUEST}
                title={values.members.length >= MAX_INVITES_PER_REQUEST ? `Up to ${MAX_INVITES_PER_REQUEST} people at a time` : undefined}
                className="flex items-center gap-1.5 px-3 py-2 bg-surface-container text-on-surface rounded-xl text-xs font-medium hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {lastInvitations.map((invite, index) => (
                  <div key={index} className="p-2.5 bg-surface border border-outline-variant/30 rounded-lg space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-on-surface">{invite.name} <span className="text-[10px] text-on-surface-variant font-normal">({invite.email})</span></span>
                      <span className="flex items-center gap-1.5">
                        {invite.resent && (
                          <span title="They had a pending invite; that old link no longer works" className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-700 uppercase">
                            Re-sent
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary uppercase">{invite.role}</span>
                      </span>
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

            {/* Some people couldn't be invited: who and why */}
            {skipped.length > 0 && (
              <div className="p-3.5 bg-error/5 border border-error/20 rounded-xl space-y-2">
                <p className="text-xs font-medium text-on-surface">Not invited ({skipped.length})</p>
                <ul className="space-y-1.5">
                  {skipped.map((s) => (
                    <li key={s.email} className="text-[11px] text-on-surface-variant">
                      <span className="font-semibold text-on-surface">{s.email}</span>: {s.reason}
                      {s.reason.includes('Team Members') && (
                        <>
                          {' '}
                          <Link to="/dashboard/members" className="font-semibold text-primary hover:underline">
                            Go to Team Members
                          </Link>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // The search, sent once typing pauses

  const loadInvitations = () =>
    dispatch(fetchInvitations({ page, page_size: INVITATIONS_PAGE_SIZE, status: statusFilter, search: query || undefined }));

  // Search on the server once typing pauses, from the first page
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, page, statusFilter, query, inviteSuccess]);

  const handleFilterChange = (value: InvitationStatus | undefined) => {
    setStatusFilter(value);
    setPage(1);
  };

  // Row actions: the invite in progress, the one asking "revoke?", and the one whose link was just copied
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCopy = (id: number, link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 3000);
  };

  // Success and failure toasts come from store/errorToastMiddleware; the list reloads to show the new status
  const handleRevoke = async (id: number) => {
    setBusyId(id);
    const result = await dispatch(revokeInvitation(id));
    setBusyId(null);
    setConfirmRevokeId(null);
    if (revokeInvitation.fulfilled.match(result)) loadInvitations();
  };

  const handleResend = async (id: number) => {
    setBusyId(id);
    const result = await dispatch(resendInvitation(id));
    setBusyId(null);
    if (resendInvitation.fulfilled.match(result)) loadInvitations();
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
        <div className="relative w-full sm:w-64 sm:ml-auto">
          {isLoadingInvitations && query && search.trim() === query ? (
            <Loader2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant animate-spin" />
          ) : (
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
            placeholder="Search by name or email"
            aria-label="Search invitations"
            maxLength={100}
            className="w-full pl-9 pr-9 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              title="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-on-surface-variant hover:bg-surface-container cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1 p-1 rounded-full bg-surface-container-low border border-outline-variant/30">
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
          <p className="p-6 text-sm text-on-surface-variant text-center">
            {query ? `No invitations match "${query}".` : 'No invitations found.'}
          </p>
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
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary uppercase">
                    {invite.role}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium uppercase ${STATUS_BADGE_STYLES[invite.status]}`}
                  >
                    {invite.status}
                  </span>

                  {/* Accepted invites are members now: nothing to do here */}
                  {invite.status !== 'accepted' &&
                    (confirmRevokeId === invite.id ? (
                      <span className="flex items-center gap-1.5 text-xs text-on-surface">
                        Revoke this invite?
                        <button
                          type="button"
                          onClick={() => handleRevoke(invite.id)}
                          disabled={busyId === invite.id}
                          className="px-2.5 py-1 rounded-lg bg-error text-on-error font-medium hover:bg-error/90 disabled:opacity-50 cursor-pointer"
                        >
                          {busyId === invite.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Revoke'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRevokeId(null)}
                          disabled={busyId === invite.id}
                          className="px-2.5 py-1 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <>
                        {invite.invite_link && (
                          <button
                            type="button"
                            onClick={() => handleCopy(invite.id, invite.invite_link!)}
                            title="Copy the invite link"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-outline-variant/40 text-xs font-medium text-on-surface hover:bg-surface-container cursor-pointer"
                          >
                            {copiedId === invite.id ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedId === invite.id ? 'Copied' : 'Copy link'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleResend(invite.id)}
                          disabled={busyId === invite.id}
                          title="Email a fresh 3-day link; the old link stops working"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-outline-variant/40 text-xs font-medium text-on-surface hover:bg-surface-container disabled:opacity-50 cursor-pointer"
                        >
                          {busyId === invite.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          {invite.status === 'pending' ? 'Resend' : 'Send again'}
                        </button>
                        {invite.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => setConfirmRevokeId(invite.id)}
                            title="Cancel this invite: its link stops working"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-error/30 text-xs font-medium text-error hover:bg-error/10 cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" /> Revoke
                          </button>
                        )}
                      </>
                    ))}
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
