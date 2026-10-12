import React, { useEffect, useState } from 'react';
import { Check, Copy, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchInvitations, generateWorkspaceInvitations } from '@/store/workspace/workspaceThunks';
import { resetInviteState, clearWorkspaceError } from '@/store/workspace/workspaceSlice';
import type { InvitationStatus } from '@/types/workspaceTypes';

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

interface MemberInput {
  name: string;
  email: string;
  role: string;
}

export function InviteMembers() {
  const dispatch = useAppDispatch();
  const { isInviting, inviteSuccess, lastInvitations, error, user } = useAppSelector((state) => state.workspace);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [members, setMembers] = useState<MemberInput[]>([
    { name: '', email: '', role: 'service' }
  ]);

  const handleAddRow = () => {
    setMembers([...members, { name: '', email: '', role: 'service' }]);
  };

  const handleRemoveRow = (index: number) => {
    if (members.length === 1) return;
    setMembers(members.filter((_, i) => i !== index));
  };

  const handleMemberChange = (index: number, field: keyof MemberInput, value: string) => {
    const updated = [...members];
    updated[index][field] = value;
    setMembers(updated);
  };

  const handleGenerateInvitations = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(generateWorkspaceInvitations(members));
  };

  const handleCopyLink = (link: string, index: number) => {
    navigator.clipboard.writeText(link);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 3000);
  };

  const handleReset = () => {
    dispatch(resetInviteState());
    dispatch(clearWorkspaceError());
    setMembers([{ name: '', email: '', role: 'service' }]);
    setCopiedIndex(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Invite Team Members</h1>
        <p className="text-sm text-on-surface-variant">Generate secure invite links for new team members.</p>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-xl p-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-error/10 text-error rounded-xl text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{typeof error === 'string' ? error : 'An error occurred'}</span>
          </div>
        )}

        {!inviteSuccess ? (
          <form onSubmit={handleGenerateInvitations} className="space-y-4">
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {members.map((member, index) => (
                <div key={index} className="flex items-center gap-2 p-3 bg-surface-container/50 border border-outline-variant/30 rounded-xl">
                  <div className="flex-1 space-y-1">
                    <label className="block text-[10px] font-medium text-on-surface-variant">Name</label>
                    <input
                      type="text"
                      required
                      value={member.name}
                      onChange={(e) => handleMemberChange(index, 'name', e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <div className="flex-1 space-y-1">
                    <label className="block text-[10px] font-medium text-on-surface-variant">Email</label>
                    <input
                      type="email"
                      required
                      value={member.email}
                      onChange={(e) => handleMemberChange(index, 'email', e.target.value)}
                      placeholder="jane@company.com"
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <div className="w-32 space-y-1">
                    <label className="block text-[10px] font-medium text-on-surface-variant">Role</label>
                    <select
                      value={member.role}
                      onChange={(e) => handleMemberChange(index, 'role', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="service">Service</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>

                  {members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(index)}
                      className="mt-5 p-2 text-error hover:bg-error/10 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
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
          <p className="text-sm text-on-surface-variant">Track invitations sent to your organization.</p>
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
