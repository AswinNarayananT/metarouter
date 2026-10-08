import React from 'react';
import { Settings, Save } from 'lucide-react';

export function WorkspaceSettings() {
  const userProfile = JSON.parse(localStorage.getItem('workspace_user') || '{}');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Workspace Settings</h1>
        <p className="text-sm text-on-surface-variant">Configure your tenant workspace preferences.</p>
      </div>

      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 shadow-xl space-y-6">
        <div>
          <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Organization Name</label>
          <input
            type="text"
            defaultValue={userProfile.organization_name}
            className="w-full px-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
          />
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

        <button className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary font-medium rounded-xl hover:bg-primary/90 transition-all shadow-md">
          <Save className="w-4 h-4" />
          <span>Save Changes</span>
        </button>
      </div>
    </div>
  );
}