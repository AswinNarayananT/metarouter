import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, Loader2, RotateCcw, Search, ShieldCheck, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchMemberOpenWork,
  fetchMembersPage,
  fetchTeamMembers,
  removeMember,
  restoreMember,
  updateMemberRole,
} from '@/store/workspace/workspaceThunks';
import { notifySuccess } from '@/utils/notify';
import type { MemberListStatus, MemberOpenWork, PaginatedTeamMembers, TeamMember } from '@/types/workspaceTypes';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;

type Role = 'admin' | 'manager' | 'service';

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: 'service', label: 'Service', description: 'Handles the chats given to them, and picks up new chats if AI Settings allows their role.' },
  { value: 'manager', label: 'Manager', description: 'Assigns chats to anyone, replies to any chat and manages ticket groups.' },
  { value: 'admin', label: 'Administrator', description: 'Can do everything: settings, channels, AI assistant, broadcasts, inviting and changing roles.' },
];

const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label ?? role;

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-primary/10 text-primary border-primary/20',
  manager: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
  service: 'bg-surface-container text-on-surface-variant border-outline-variant/40',
};

const roleStyle = (role: string) => ROLE_STYLES[role] ?? ROLE_STYLES.service;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('') || '?';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function TeamMembers() {
  const dispatch = useAppDispatch();
  // The full member list only feeds the remove dialog's "give their chats to" picker
  const { teamMembers, user } = useAppSelector((state) => state.workspace);
  const isAdmin = user?.role === 'admin';

  // The page the server returned, tagged with the request it answers (loading = the tag doesn't match yet)
  const [tab, setTab] = useState<MemberListStatus>('current');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // The search, sent once typing pauses
  const [page, setPage] = useState(1);
  const [reloads, setReloads] = useState(0); // Bumped after a role change, remove or restore
  const [result, setResult] = useState<{ key: string; data: PaginatedTeamMembers | null; error: string | null } | null>(null);
  const requestKey = `${tab}|${query}|${page}|${reloads}`;
  const isLoading = result?.key !== requestKey;
  const data = result?.data ?? null;

  // Role picked in a member's dropdown, waiting for confirmation
  const [pending, setPending] = useState<{ member: TeamMember; role: Role } | null>(null);
  const [saving, setSaving] = useState(false);
  // Member waiting for the remove confirmation
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  useEffect(() => {
    if (isAdmin) dispatch(fetchTeamMembers());
  }, [dispatch, isAdmin]);

  // 1. Search on the server once typing pauses, from the first page
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // 2. Load the page; an emptied last page (after a remove / restore) steps back one, and an emptied Former tab closes
  useEffect(() => {
    const key = `${tab}|${query}|${page}|${reloads}`;
    dispatch(fetchMembersPage({ status: tab, search: query || undefined, page, page_size: PAGE_SIZE })).then((res) => {
      if (!fetchMembersPage.fulfilled.match(res)) {
        setResult({ key, data: null, error: (res.payload as string) ?? "Couldn't load team members" });
        return;
      }
      if (tab === 'removed' && res.payload.removed_count === 0) {
        setTab('current');
        setPage(1);
      } else if (res.payload.items.length === 0 && page > 1) setPage(page - 1);
      setResult({ key, data: res.payload, error: null });
    });
  }, [dispatch, tab, query, page, reloads]);

  const reload = () => setReloads((n) => n + 1);

  const switchTab = (next: MemberListStatus) => {
    setTab(next);
    setPage(1);
  };

  const handleRemoved = (member: TeamMember, newOwner: TeamMember | null, openWork: number) => {
    setRemoving(null);
    reload();
    const handover = openWork === 0 ? '' : newOwner ? ` Their open chats went to ${newOwner.name}.` : ' Their open chats went back to the unassigned queue.';
    notifySuccess(`${member.name} was removed.${handover}`);
  };

  const handleRestore = async (member: TeamMember) => {
    setRestoringId(member.id);
    const res = await dispatch(restoreMember(member.id));
    setRestoringId(null);
    // A failure (e.g. the email joined another workspace) shows as a toast
    if (restoreMember.fulfilled.match(res)) {
      reload();
      notifySuccess(`${member.name} is back as ${roleLabel(member.role)}. They can log in with their old password.`);
    }
  };

  const confirmRoleChange = async () => {
    if (!pending) return;
    setSaving(true);
    const res = await dispatch(updateMemberRole({ userId: pending.member.id, role: pending.role }));
    setSaving(false);
    // A failure shows as a toast (store/errorToastMiddleware) and the dialog stays open
    if (updateMemberRole.fulfilled.match(res)) {
      reload();
      notifySuccess(`${pending.member.name} is now ${roleLabel(pending.role)}. They've been notified.`);
      setPending(null);
    }
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const showFormerTab = isAdmin && (tab === 'removed' || (data?.removed_count ?? 0) > 0);
  const noMatch = query ? `No ${tab === 'removed' ? 'former members' : 'members'} match "${query}".` : tab === 'removed' ? 'No former members.' : 'No team members yet.';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Team Members</h1>
          <p className="text-sm text-on-surface-variant">
            {isAdmin ? 'See who is on your team, change roles and remove members.' : 'Everyone in your workspace.'}
          </p>
        </div>
        {isAdmin && (
          <Link
            to="/dashboard/invite"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Invite members
          </Link>
        )}
      </div>

      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-sm overflow-hidden">
        {/* Toolbar: tabs (admins see former members) and search */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant/30">
          <div className="flex items-center gap-1" role="tablist">
            <TabButton active={tab === 'current'} onClick={() => switchTab('current')} label="Members" count={data?.current_count} />
            {showFormerTab && (
              <TabButton active={tab === 'removed'} onClick={() => switchTab('removed')} label="Former" count={data?.removed_count} />
            )}
          </div>
          <div className="relative w-full sm:w-64">
            {isLoading && search.trim() === query && query ? (
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
              aria-label="Search members"
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
        </div>

        {result?.error && !isLoading ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-error">{result.error}</p>
            <button type="button" onClick={reload} className="text-xs font-medium text-primary hover:underline cursor-pointer">
              Try again
            </button>
          </div>
        ) : isLoading && !data ? (
          <ul className="divide-y divide-outline-variant/30" aria-label="Loading team members">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-surface-container" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 rounded bg-surface-container" />
                  <div className="h-3 w-48 rounded bg-surface-container" />
                </div>
                <div className="h-6 w-20 rounded-full bg-surface-container" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState text={noMatch} />
        ) : tab === 'removed' ? (
            <ul className={`divide-y divide-outline-variant/30 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
              {items.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={member.name} muted />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface-variant truncate">{member.name}</p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {member.email}
                        {member.removed_at && ` · ${member.removal_type === 'left' ? 'Left' : 'Removed'} ${formatDate(member.removed_at)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:inline text-xs text-on-surface-variant">Was {roleLabel(member.role)}</span>
                    <button
                      type="button"
                      onClick={() => handleRestore(member)}
                      disabled={restoringId === member.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 disabled:opacity-50 cursor-pointer"
                    >
                      {restoringId === member.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Restore
                    </button>
                  </div>
                </li>
              ))}
            </ul>
        ) : (
          <ul className={`divide-y divide-outline-variant/30 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
            {items.map((member) => {
              const isYou = member.id === user?.id;
              return (
                <li key={member.id} className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-container/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={member.name} role={member.role} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-on-surface">
                        <span className="truncate">{member.name}</span>
                        {isYou && (
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary shrink-0">
                            You
                          </span>
                        )}
                        {!member.is_active && (
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-error/10 text-error shrink-0">
                            Inactive
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Admins change other members' roles; nobody changes their own */}
                    {isAdmin && !isYou ? (
                      <div className="relative">
                        <select
                          value={member.role}
                          onChange={(e) => setPending({ member, role: e.target.value as Role })}
                          aria-label={`Role of ${member.name}`}
                          className={`appearance-none pl-3 pr-7 py-1 rounded-full text-xs font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 ${roleStyle(member.role)}`}
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-70" />
                      </div>
                    ) : (
                      <span
                        title={isAdmin && isYou ? "You can't change your own role. Ask another admin." : undefined}
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${roleStyle(member.role)}`}
                      >
                        {roleLabel(member.role)}
                      </span>
                    )}
                    {/* A labelled button (not a bare icon), so it's clear it removes the member; your own row keeps the space empty */}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setRemoving(member)}
                        disabled={isYou}
                        aria-hidden={isYou}
                        tabIndex={isYou ? -1 : undefined}
                        aria-label={`Remove ${member.name} from the workspace`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-error/30 text-error text-xs font-medium hover:bg-error/10 transition-colors cursor-pointer disabled:invisible"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Remove</span>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-outline-variant/30">
            <p className="text-xs text-on-surface-variant">
              Showing {rangeStart}–{rangeEnd} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1 || isLoading}
                className="px-3 py-1 rounded-lg text-xs font-medium border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/5 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-xs text-on-surface-variant">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages || isLoading}
                className="px-3 py-1 rounded-lg text-xs font-medium border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/5 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {removing && (
        <RemoveMemberDialog
          member={removing}
          others={teamMembers.filter((m) => m.id !== removing.id && m.is_active)}
          onCancel={() => setRemoving(null)}
          onRemoved={handleRemoved}
        />
      )}

      {pending && (
        <ChangeRoleDialog
          member={pending.member}
          role={pending.role}
          saving={saving}
          onCancel={() => setPending(null)}
          onConfirm={confirmRoleChange}
        />
      )}
    </div>
  );
}

const AVATAR_STYLES: Record<string, string> = {
  admin: 'bg-primary/15 text-primary',
  manager: 'bg-sky-500/15 text-sky-700',
  service: 'bg-surface-container text-on-surface',
};

function Avatar({ name, role = 'service', muted = false }: { name: string; role?: string; muted?: boolean }) {
  const style = muted ? 'bg-surface-container text-on-surface-variant opacity-70' : AVATAR_STYLES[role] ?? AVATAR_STYLES.service;
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 ${style}`} aria-hidden="true">
      {initials(name)}
    </div>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
        active ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container'
      }`}
    >
      {label}
      {count !== undefined && <span className={`text-xs ${active ? 'text-primary/80' : 'text-on-surface-variant/80'}`}>{count}</span>}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center">
      <Users className="w-6 h-6 text-on-surface-variant/60" />
      <p className="text-sm text-on-surface-variant">{text}</p>
    </div>
  );
}

function ChangeRoleDialog({
  member,
  role,
  saving,
  onCancel,
  onConfirm,
}: {
  member: TeamMember;
  role: Role;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const target = ROLES.find((r) => r.value === role)!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onCancel]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Change role" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !saving && onCancel()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <ShieldCheck className="w-4 h-4 text-primary" /> Change role
          </h2>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Cancel" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-sm text-on-surface">
          <p>
            Change <strong>{member.name}</strong>'s role from <strong>{roleLabel(member.role)}</strong> to{' '}
            <strong>{target.label}</strong>?
          </p>
          <p className="text-xs text-on-surface-variant">
            <strong className="text-on-surface">{target.label}:</strong> {target.description}
          </p>
          {role === 'admin' && (
            <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              Administrators have full control of the workspace, including changing other members' roles.
            </p>
          )}
          <p className="text-xs text-on-surface-variant">
            It applies right away. Chats already assigned to them stay theirs, and they'll get a notification.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30">
          <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-xl text-sm text-on-surface hover:bg-surface-container cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Change role
          </button>
        </div>
      </div>
    </div>
  );
}

function RemoveMemberDialog({
  member,
  others,
  onCancel,
  onRemoved,
}: {
  member: TeamMember;
  others: TeamMember[]; // Who can take over their open chats
  onCancel: () => void;
  onRemoved: (member: TeamMember, newOwner: TeamMember | null, openWork: number) => void;
}) {
  const dispatch = useAppDispatch();
  const [openWork, setOpenWork] = useState<MemberOpenWork | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState<number | null>(null); // null = the unassigned queue
  const [saving, setSaving] = useState(false);

  // 1. What needs a new owner
  useEffect(() => {
    dispatch(fetchMemberOpenWork(member.id)).then((result) => {
      if (fetchMemberOpenWork.fulfilled.match(result)) setOpenWork(result.payload);
      else setLoadError(result.payload as string);
    });
  }, [dispatch, member.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onCancel]);

  const workCount = openWork ? openWork.open_chats + openWork.open_tickets : 0;

  // 2. Remove; a failure shows as a toast (store/errorToastMiddleware) and the dialog stays open
  const confirm = async () => {
    setSaving(true);
    const target = workCount > 0 ? reassignTo : null;
    const result = await dispatch(removeMember({ userId: member.id, reassignTo: target }));
    setSaving(false);
    if (removeMember.fulfilled.match(result)) {
      onRemoved(member, others.find((m) => m.id === target) ?? null, workCount);
    }
  };

  const plural = (n: number, word: string) => `${n} open ${word}${n === 1 ? '' : 's'}`;

  return (
    <div role="dialog" aria-modal="true" aria-label="Remove member" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !saving && onCancel()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <UserMinus className="w-4 h-4 text-error" /> Remove member
          </h2>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Cancel" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm text-on-surface">
          <p>
            Remove <strong>{member.name}</strong> from the workspace? They lose access immediately and are signed out
            everywhere. Their past messages and tickets stay.
          </p>

          {/* Their open work */}
          {loadError ? (
            <p className="text-xs text-error">{loadError}</p>
          ) : !openWork ? (
            <p className="flex items-center gap-2 text-xs text-on-surface-variant">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking their open chats…
            </p>
          ) : workCount === 0 ? (
            <p className="text-xs text-on-surface-variant">They have no open chats or tickets.</p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-on-surface">
                They have {plural(openWork.open_chats, 'chat')} and {plural(openWork.open_tickets, 'ticket')}. Who takes them over?
              </legend>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" name="reassign" checked={reassignTo === null} onChange={() => setReassignTo(null)} className="accent-primary" />
                Move them to the unassigned queue
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="reassign"
                  checked={reassignTo !== null}
                  onChange={() => setReassignTo(others[0]?.id ?? null)}
                  disabled={others.length === 0}
                  className="accent-primary"
                />
                Give them to
                <select
                  value={reassignTo ?? ''}
                  onChange={(e) => setReassignTo(Number(e.target.value))}
                  disabled={others.length === 0}
                  aria-label="Member who takes over"
                  className="px-2 py-1 rounded-lg bg-surface border border-outline/30 text-xs focus:outline-none focus:border-primary"
                >
                  {reassignTo === null && <option value="">Choose a member</option>}
                  {others.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({roleLabel(m.role)})
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          )}

          <p className="text-xs text-on-surface-variant">
            You can restore them later from the "Former" tab, or another workspace can invite their email.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30">
          <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-xl text-sm text-on-surface hover:bg-surface-container cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving || (!openWork && !loadError)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-error text-on-error text-sm font-medium hover:bg-error/90 disabled:opacity-50 cursor-pointer"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Remove
          </button>
        </div>
      </div>
    </div>
  );
}
