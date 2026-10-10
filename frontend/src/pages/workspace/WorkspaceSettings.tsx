import { useState, useEffect } from 'react';
import { Save, Building2, User, Edit2, X } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { fetchOrganization } from '@/store/workspace/workspaceThunks';

export function WorkspaceSettings() {
  const dispatch = useAppDispatch();
  const { user, organization } = useAppSelector((state) => state.workspace);
  const isAdmin = user?.role === 'admin';

  const [isEditingWorkspace, setIsEditingWorkspace] = useState(false);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [personalName, setPersonalName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Settings</h1>
        <p className="text-sm text-on-surface-variant">Manage your workspace and personal preferences.</p>
      </div>

      {/* Workspace Details - Admin Only */}
      {isAdmin && (
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-outline-variant/30">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-on-surface">Workspace Details</h2>
            </div>
            {!isEditingWorkspace && (
              <button
                onClick={() => setIsEditingWorkspace(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container text-on-surface rounded-lg text-xs font-medium hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Organization Name</label>
              {isEditingWorkspace ? (
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              ) : (
                <div className="px-4 py-2.5 bg-surface/50 border border-outline/30 rounded-xl text-sm text-on-surface-variant">
                  {organization?.name || user?.organization_name || 'N/A'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">WhatsApp Webhook Status</label>
              <input
                type="text"
                disabled
                value="Active & Securely Tunneled"
                className="w-full px-4 py-2.5 bg-surface/50 border border-outline/30 rounded-xl text-sm text-on-surface-variant cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      )}

      {/* Personal Details - All Users */}
      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant/30">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-on-surface">Personal Details</h2>
          </div>
          {!isEditingPersonal && (
            <button
              onClick={() => setIsEditingPersonal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container text-on-surface rounded-lg text-xs font-medium hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Full Name</label>
            {isEditingPersonal ? (
              <input
                type="text"
                value={personalName}
                onChange={(e) => setPersonalName(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
              />
            ) : (
              <div className="px-4 py-2.5 bg-surface/50 border border-outline/30 rounded-xl text-sm text-on-surface-variant">
                {user?.name || 'N/A'}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Email</label>
            <div className="px-4 py-2.5 bg-surface/50 border border-outline/30 rounded-xl text-sm text-on-surface-variant">
              {user?.email || 'N/A'}
            </div>
            <p className="text-[10px] text-on-surface-variant mt-1">Email cannot be changed</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Role</label>
            <div className="px-4 py-2.5 bg-surface/50 border border-outline/30 rounded-xl text-sm text-on-surface-variant capitalize">
              {user?.role || 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {(isEditingWorkspace || isEditingPersonal) && (
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary font-medium rounded-xl hover:bg-primary/90 transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 bg-surface-container text-on-surface font-medium rounded-xl hover:bg-surface-container-high transition-all disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        </div>
      )}
    </div>
  );
}