import { useState } from 'react';
import { Check, Eye, Loader2, Save, ShieldCheck, Users } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { updateOrganization } from '@/store/workspace/workspaceThunks';
import type { ChatVisibilityOption, OrganizationChatVisibility } from '@/types/workspaceTypes';

const DEFAULT_VISIBILITY: OrganizationChatVisibility = {
  manager: 'all',
  service: 'all',
};

interface VisibilityOptionConfig {
  value: ChatVisibilityOption;
  label: string;
  badge: string;
  description: string;
}

const VISIBILITY_OPTIONS: VisibilityOptionConfig[] = [
  {
    value: 'all',
    label: 'All chats',
    badge: 'Full scope',
    description: 'Can see all customer chats across the workspace, including AI-handled conversations.',
  },
  {
    value: 'handovered',
    label: 'Handed-over chats',
    badge: 'Team only',
    description: 'Can see unassigned and team chats escalated to humans. AI-handled chats and their tickets are hidden.',
  },
  {
    value: 'assigned',
    label: 'Assigned chats only',
    badge: 'Personal only',
    description: 'Can only view conversations directly assigned to them, so someone must assign chats to them. Other conversations and their tickets are hidden.',
  },
];

export function ChatVisibilityCard() {
  const dispatch = useAppDispatch();
  const organization = useAppSelector((state) => state.workspace.organization);
  const currentVisibility = organization?.chat_visibility ?? DEFAULT_VISIBILITY;

  // Only what the admin has picked but not saved; everything else shows the saved rules as they load or update
  const [managerChoice, setManagerVisibility] = useState<ChatVisibilityOption | null>(null);
  const [serviceChoice, setServiceVisibility] = useState<ChatVisibilityOption | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const managerVisibility = managerChoice ?? currentVisibility.manager;
  const serviceVisibility = serviceChoice ?? currentVisibility.service;

  const hasChanges = managerVisibility !== currentVisibility.manager || serviceVisibility !== currentVisibility.service;

  const handleReset = () => {
    setManagerVisibility(null);
    setServiceVisibility(null);
  };

  const handleSave = async () => {
    if (!hasChanges || isSaving) return;
    setIsSaving(true);
    const result = await dispatch(
      updateOrganization({
        chat_visibility: {
          manager: managerVisibility,
          service: serviceVisibility,
        },
      })
    );
    setIsSaving(false);
    // A failed save shows as a toast and keeps the choices
    if (updateOrganization.fulfilled.match(result)) handleReset();
  };

  return (
    <section className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-outline-variant/30">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Eye className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Chat visibility</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Control which customer chats team members can view based on their workspace role.
            </p>
          </div>
        </div>

        {hasChanges && (
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-on-primary rounded-xl text-xs font-medium hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{isSaving ? 'Saving…' : 'Save'}</span>
            </button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Administrator (Fixed) */}
        <div className="p-4 rounded-xl bg-surface border border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-on-surface">Administrator</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary">
                  All chats
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Full access — workspace administrators can always view every conversation across all channels.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-on-surface-variant/70 shrink-0 self-start sm:self-auto sm:text-right">
            Non-configurable
          </span>
        </div>

        {/* Manager Role Selector */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-on-surface-variant" />
            <h3 className="text-sm font-semibold text-on-surface">Manager</h3>
            <span className="text-xs text-on-surface-variant">— team supervisors & department leads</span>
          </div>

          <div
            role="radiogroup"
            aria-label="Manager chat visibility"
            className="grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            {VISIBILITY_OPTIONS.map((opt) => {
              const selected = managerVisibility === opt.value;
              return (
                <button
                  key={`manager-${opt.value}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setManagerVisibility(opt.value)}
                  className={`relative p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-outline-variant/30 bg-surface hover:border-primary/50 hover:bg-surface-container-low'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-on-surface">{opt.label}</span>
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                          selected ? 'bg-primary text-on-primary' : 'border border-outline/40'
                        }`}
                      >
                        {selected && <Check className="w-2.5 h-2.5" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">{opt.description}</p>
                  </div>
                  <span
                    className={`mt-2.5 inline-block w-fit px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      selected ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {opt.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Service Role Selector */}
        <div className="space-y-3 pt-2 border-t border-outline-variant/20">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-on-surface-variant" />
            <h3 className="text-sm font-semibold text-on-surface">Service</h3>
            <span className="text-xs text-on-surface-variant">— frontline support and sales representatives</span>
          </div>

          <div
            role="radiogroup"
            aria-label="Service chat visibility"
            className="grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            {VISIBILITY_OPTIONS.map((opt) => {
              const selected = serviceVisibility === opt.value;
              return (
                <button
                  key={`service-${opt.value}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setServiceVisibility(opt.value)}
                  className={`relative p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-outline-variant/30 bg-surface hover:border-primary/50 hover:bg-surface-container-low'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-on-surface">{opt.label}</span>
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                          selected ? 'bg-primary text-on-primary' : 'border border-outline/40'
                        }`}
                      >
                        {selected && <Check className="w-2.5 h-2.5" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">{opt.description}</p>
                  </div>
                  <span
                    className={`mt-2.5 inline-block w-fit px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      selected ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {opt.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action bar for saving */}
        {hasChanges && (
          <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-between gap-3">
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              You have unsaved visibility changes.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-medium hover:bg-primary/90 transition-all shadow-md disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{isSaving ? 'Saving changes…' : 'Save changes'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

