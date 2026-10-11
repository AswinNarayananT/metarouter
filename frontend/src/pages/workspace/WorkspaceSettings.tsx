import { useState, useEffect, useMemo } from 'react';
import {
  Save,
  Building2,
  User,
  Edit2,
  X,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  Circle,
  CheckCircle2,
  Lock,
  Webhook,
  Copy,
  Calendar,
  Link2,
  Hash,
  AlertCircle,
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { fetchOrganization } from '@/store/workspace/workspaceThunks';

type SettingsTab = 'workspace' | 'profile' | 'security';

/* ---------- Small reusable pieces ---------- */

function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl">
      <div className="flex items-start justify-between gap-4 p-6 border-b border-outline-variant/30">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface">{title}</h2>
            {description && (
              <p className="text-sm text-on-surface-variant mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-6 sm:items-start">
      <div className="sm:pt-2.5">
        <label className="block text-sm font-medium text-on-surface">{label}</label>
        {hint && <p className="text-xs text-on-surface-variant mt-0.5">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function ReadOnlyValue({
  children,
  capitalize,
}: {
  children: React.ReactNode;
  capitalize?: boolean;
}) {
  return (
    <div
      className={`px-4 py-2.5 bg-surface/50 border border-outline/30 rounded-xl text-sm text-on-surface-variant ${
        capitalize ? 'capitalize' : ''
      }`}
    >
      {children}
    </div>
  );
}

const inputClass =
  'w-full px-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary transition-colors';

function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${inputClass} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

/* ---------- Main component ---------- */

export function WorkspaceSettings() {
  const dispatch = useAppDispatch();
  const { user, organization, isLoading, error } = useAppSelector((state) => state.workspace);
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<SettingsTab | null>(null);
  const [isEditingWorkspace, setIsEditingWorkspace] = useState(false);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [personalName, setPersonalName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  // Fetch organization only once when admin and user info is present
  useEffect(() => {
    if (isAdmin && user?.organization_id && !organization) {
      dispatch(fetchOrganization(user.organization_id));
    }
  }, [dispatch, isAdmin, user?.organization_id, organization]);

  // Sync local inputs when store data updates
  useEffect(() => {
    if (organization?.name) {
      setWorkspaceName(organization.name);
    }
  }, [organization]);

  useEffect(() => {
    if (user?.name) {
      setPersonalName(user.name);
    }
  }, [user]);

  const handleSave = () => {
    setIsSaving(true);
    // TODO: Implement save API calls
    setTimeout(() => {
      setIsSaving(false);
      setIsEditingWorkspace(false);
      setIsEditingPersonal(false);
    }, 1000);
  };

  const handleCancel = () => {
    setIsEditingWorkspace(false);
    setIsEditingPersonal(false);
    setWorkspaceName(organization?.name || '');
    setPersonalName(user?.name || '');
  };

  /* ----- Organization details (from store) ----- */
  const orgLoading = isLoading && !organization;
  const createdOn = (() => {
    if (!organization?.created_at) return null;
    const d = new Date(organization.created_at);
    return isNaN(d.getTime())
      ? null
      : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  })();

  const handleRetryOrganization = () => {
    if (user?.organization_id) dispatch(fetchOrganization(user.organization_id));
  };

  const handleCopyOrgId = async () => {
    if (!organization?.id) return;
    try {
      await navigator.clipboard.writeText(String(organization.id));
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  /* ----- Password rules ----- */
  const rules = useMemo(
    () => [
      { label: 'At least 8 characters', ok: newPassword.length >= 8 },
      { label: 'One uppercase letter', ok: /[A-Z]/.test(newPassword) },
      { label: 'One lowercase letter', ok: /[a-z]/.test(newPassword) },
      { label: 'One number', ok: /\d/.test(newPassword) },
    ],
    [newPassword]
  );
  const passedRules = rules.filter((r) => r.ok).length;
  const strengthLabel = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][passedRules];
  const strengthColor =
    passedRules <= 1 ? 'bg-error' : passedRules < 4 ? 'bg-primary/60' : 'bg-primary';
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canUpdatePassword =
    currentPassword.length > 0 && passedRules === rules.length && passwordsMatch;

  const handlePasswordUpdate = () => {
    if (!canUpdatePassword) return;
    setIsUpdatingPassword(true);
    setPasswordUpdated(false);
    // TODO: Implement change password API call
    setTimeout(() => {
      setIsUpdatingPassword(false);
      setPasswordUpdated(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }, 1000);
  };

  /* ----- Tabs ----- */
  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    ...(isAdmin
      ? [{ id: 'workspace' as const, label: 'Workspace', icon: Building2 }]
      : []),
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: ShieldCheck },
  ];
  const activeTab: SettingsTab = tab ?? (isAdmin ? 'workspace' : 'profile');

  const displayName = user?.name || user?.email || 'User';
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const editButton = (onClick: () => void) => (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container text-on-surface rounded-lg text-xs font-medium hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
    >
      <Edit2 className="w-3.5 h-3.5" />
      <span>Edit</span>
    </button>
  );

  const isEditing = isEditingWorkspace || isEditingPersonal;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Settings</h1>
        <p className="text-sm text-on-surface-variant">
          Manage your workspace, profile and account security.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        {/* Settings navigation */}
        <nav
          aria-label="Settings sections"
          className="md:w-52 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible border-b md:border-b-0 border-outline-variant/30 pb-2 md:pb-0"
        >
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? 'bg-primary text-on-primary shadow-md'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Section content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* ---------- Workspace (admin only) ---------- */}
          {activeTab === 'workspace' && isAdmin && (
            <SectionCard
              icon={Building2}
              title="Workspace details"
              description="Settings that apply to everyone in your organization."
              action={!isEditingWorkspace && editButton(() => setIsEditingWorkspace(true))}
            >
              <Field label="Organization name" hint="Shown to your team members.">
                {isEditingWorkspace ? (
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className={inputClass}
                  />
                ) : (
                  <ReadOnlyValue>
                    {organization?.name || user?.organization_name || 'N/A'}
                  </ReadOnlyValue>
                )}
              </Field>

              {orgLoading ? (
                <div className="space-y-5" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-6">
                      <div className="h-4 w-28 rounded bg-surface-container animate-pulse sm:mt-2.5" />
                      <div className="sm:col-span-2 h-10 rounded-xl bg-surface-container animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : !organization && error ? (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-error-container/20 border border-error/30 text-sm text-error"
                >
                  <span className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Couldn't load organization details.
                  </span>
                  <button
                    onClick={handleRetryOrganization}
                    className="text-xs font-medium underline cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <Field label="Workspace slug" hint="Unique identifier for your workspace.">
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-surface/50 border border-outline/30 rounded-xl text-sm text-on-surface-variant">
                      <Link2 className="w-4 h-4 shrink-0" />
                      <span className="truncate">{organization?.slug || 'N/A'}</span>
                    </div>
                  </Field>

                  <Field label="Organization ID" hint="Use this when contacting support.">
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-surface/50 border border-outline/30 rounded-xl text-sm text-on-surface-variant">
                      <Hash className="w-4 h-4 shrink-0" />
                      <span className="flex-1 truncate font-mono text-xs">
                        {organization?.id ?? 'N/A'}
                      </span>
                      {organization?.id && (
                        <button
                          onClick={handleCopyOrgId}
                          aria-label="Copy organization ID"
                          className="flex items-center gap-1 text-xs font-medium text-on-surface hover:text-primary transition-colors cursor-pointer"
                        >
                          {copiedId ? (
                            <Check className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedId ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>
                  </Field>

                  <Field label="Created on">
                    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-surface/50 border border-outline/30 rounded-xl text-sm text-on-surface-variant">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>{createdOn || 'N/A'}</span>
                    </div>
                  </Field>
                </>
              )}

              <Field label="WhatsApp webhook" hint="Managed automatically.">
                <div className="flex items-center gap-2.5 px-4 py-2.5 bg-surface/50 border border-outline/30 rounded-xl text-sm text-on-surface-variant cursor-not-allowed">
                  <Webhook className="w-4 h-4 shrink-0" />
                  <span className="flex-1">Active &amp; Securely Tunneled</span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-on-surface">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    Active
                  </span>
                </div>
              </Field>
            </SectionCard>
          )}

          {/* ---------- Profile (all users) ---------- */}
          {activeTab === 'profile' && (
            <SectionCard
              icon={User}
              title="Personal details"
              description="Your personal information within this workspace."
              action={!isEditingPersonal && editButton(() => setIsEditingPersonal(true))}
            >
              <div className="flex items-center gap-4 pb-5 border-b border-outline-variant/30">
                <div className="w-14 h-14 rounded-full bg-surface-container border border-outline-variant/40 flex items-center justify-center text-base font-semibold text-on-surface shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">
                    {user?.name || 'N/A'}
                  </p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {user?.organization_name || 'Workspace'} ·{' '}
                    <span className="capitalize">{user?.role}</span>
                  </p>
                </div>
              </div>

              <Field label="Full name">
                {isEditingPersonal ? (
                  <input
                    type="text"
                    value={personalName}
                    onChange={(e) => setPersonalName(e.target.value)}
                    className={inputClass}
                  />
                ) : (
                  <ReadOnlyValue>{user?.name || 'N/A'}</ReadOnlyValue>
                )}
              </Field>

              <Field label="Email" hint="Email cannot be changed.">
                <ReadOnlyValue>{user?.email || 'N/A'}</ReadOnlyValue>
              </Field>

              <Field label="Role" hint="Assigned by a workspace admin.">
                <ReadOnlyValue capitalize>{user?.role || 'N/A'}</ReadOnlyValue>
              </Field>
            </SectionCard>
          )}

          {/* ---------- Security (all users) ---------- */}
          {activeTab === 'security' && (
            <SectionCard
              icon={KeyRound}
              title="Change password"
              description="Use a strong password you don't use anywhere else."
            >
              {passwordUpdated && (
                <div
                  role="status"
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-primary/10 border border-primary/30 text-sm text-on-surface"
                >
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <span>Password updated successfully.</span>
                </div>
              )}

              <Field label="Current password">
                <PasswordField
                  value={currentPassword}
                  onChange={(v) => {
                    setCurrentPassword(v);
                    setPasswordUpdated(false);
                  }}
                  autoComplete="current-password"
                />
              </Field>

              <Field label="New password">
                <div className="space-y-3">
                  <PasswordField
                    value={newPassword}
                    onChange={(v) => {
                      setNewPassword(v);
                      setPasswordUpdated(false);
                    }}
                    autoComplete="new-password"
                  />

                  {newPassword.length > 0 && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 grid grid-cols-4 gap-1.5">
                          {[1, 2, 3, 4].map((n) => (
                            <span
                              key={n}
                              className={`h-1.5 rounded-full transition-colors ${
                                passedRules >= n ? strengthColor : 'bg-surface-container'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-on-surface-variant w-16 text-right">
                          {strengthLabel}
                        </span>
                      </div>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {rules.map((r) => (
                          <li
                            key={r.label}
                            className={`flex items-center gap-2 text-xs ${
                              r.ok ? 'text-on-surface' : 'text-on-surface-variant'
                            }`}
                          >
                            {r.ok ? (
                              <Check className="w-3.5 h-3.5 text-primary" />
                            ) : (
                              <Circle className="w-3.5 h-3.5" />
                            )}
                            {r.label}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </Field>

              <Field label="Confirm new password">
                <PasswordField
                  value={confirmPassword}
                  onChange={(v) => {
                    setConfirmPassword(v);
                    setPasswordUpdated(false);
                  }}
                  autoComplete="new-password"
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-error mt-1.5">Passwords do not match.</p>
                )}
              </Field>

              <div className="flex items-center justify-between gap-4 pt-5 border-t border-outline-variant/30">
                <p className="hidden sm:flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <Lock className="w-3.5 h-3.5" />
                  Your password is stored securely and never shown in plain text.
                </p>
                <button
                  onClick={handlePasswordUpdate}
                  disabled={!canUpdatePassword || isUpdatingPassword}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:bg-primary/90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ml-auto"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{isUpdatingPassword ? 'Updating...' : 'Update password'}</span>
                </button>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {/* Sticky action bar for workspace / personal edits */}
      {isEditing && (
        <div className="fixed bottom-0 inset-x-0 z-20 pointer-events-none">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
            <div className="pointer-events-auto flex items-center justify-between gap-3 bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl px-5 py-3">
              <p className="text-sm text-on-surface-variant">You have unsaved changes.</p>
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-surface-container text-on-surface text-sm font-medium rounded-xl hover:bg-surface-container-high transition-all disabled:opacity-50 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:bg-primary/90 transition-all shadow-md disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : 'Save changes'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}