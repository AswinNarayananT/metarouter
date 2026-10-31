import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { AlertCircle, Bot, FlaskConical, Save } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchAISettings, saveAISettings, setAiAutoReply } from '@/store/workspace/workspaceThunks';
import { useAiAutoReply } from '@/hooks/useAiAutoReply';
import { Switch } from '@/components/ui/Switch';
import { resetAISettingsSaveState } from '@/store/workspace/workspaceSlice';
import type { HandoverRole } from '@/types/workspaceTypes';
import { KnowledgeBaseCard } from '@/components/knowledge/KnowledgeBaseCard';
import { AISimulatorDrawer } from '@/components/ai/AISimulatorDrawer';

const MAX_INSTRUCTIONS_LENGTH = 4000;
const MAX_GREETING_LENGTH = 500;

const HANDOVER_ROLES: { value: HandoverRole; label: string; description: string }[] = [
  { value: 'admin', label: 'Administrator', description: 'Workspace admins' },
  { value: 'manager', label: 'Manager', description: 'Team managers' },
  { value: 'service', label: 'Service', description: 'Support staff' },
];

interface AISettingsFormValues {
  bot_name: string;
  system_instructions: string;
  allowed_roles_for_handover: HandoverRole[];
  greeting_message: string;
}

const validationSchema = Yup.object({
  bot_name: Yup.string()
    .trim()
    .required('Bot name is required')
    .min(2, 'Bot name must be at least 2 characters')
    .max(100, 'Bot name must be 100 characters or less'),
  system_instructions: Yup.string().max(
    MAX_INSTRUCTIONS_LENGTH,
    `Instructions must be ${MAX_INSTRUCTIONS_LENGTH} characters or less`
  ),
  allowed_roles_for_handover: Yup.array()
    .of(Yup.string().oneOf(HANDOVER_ROLES.map((r) => r.value)))
    .min(1, 'Select at least one role for human handover'),
  greeting_message: Yup.string().max(MAX_GREETING_LENGTH, `Greeting must be ${MAX_GREETING_LENGTH} characters or less`),
});

const inputClass =
  'w-full px-4 py-2.5 bg-surface border rounded-xl text-sm text-on-surface focus:outline-none transition-colors';

function fieldBorder(hasError: boolean) {
  return hasError ? 'border-error focus:border-error' : 'border-outline/30 focus:border-primary';
}

export function AISettings() {
  const dispatch = useAppDispatch();
  // "Try it" drawer: tests the saved settings and knowledge base
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const closeSimulator = useCallback(() => setSimulatorOpen(false), []);
  const aiAutoReply = useAiAutoReply();
  const [savingAutoReply, setSavingAutoReply] = useState(false);
  const toggleAutoReply = async (enabled: boolean) => {
    setSavingAutoReply(true);
    await dispatch(setAiAutoReply(enabled)); // A failure shows as a toast
    setSavingAutoReply(false);
  };
  const {
    aiSettings,
    isLoadingAISettings,
    aiSettingsLoadError,
    isSavingAISettings,
    aiSettingsSaveSuccess,
    aiSettingsSaveError,
  } = useAppSelector((state) => state.workspace);

  useEffect(() => {
    dispatch(fetchAISettings());
    return () => {
      dispatch(resetAISettingsSaveState());
    };
  }, [dispatch]);

  const initialValues = useMemo<AISettingsFormValues>(
    () => ({
      bot_name: aiSettings?.bot_name ?? 'Support Assistant',
      system_instructions: aiSettings?.system_instructions ?? '',
      allowed_roles_for_handover: aiSettings?.allowed_roles_for_handover ?? ['admin', 'manager'],
      greeting_message: aiSettings?.greeting_message ?? '',
    }),
    [aiSettings]
  );

  const formik = useFormik<AISettingsFormValues>({
    initialValues,
    enableReinitialize: true, // re-sync with the store after load / save
    validationSchema,
    onSubmit: async (values) => {
      await dispatch(
        saveAISettings({
          bot_name: values.bot_name.trim(),
          system_instructions: values.system_instructions.trim(),
          allowed_roles_for_handover: values.allowed_roles_for_handover,
          greeting_message: values.greeting_message.trim(),
        })
      );
    },
  });

  const { values, errors, touched, dirty, handleChange, handleBlur, setFieldValue, setFieldTouched } = formik;

  // Hide the last save result as soon as the user edits the form again
  useEffect(() => {
    if (dirty && (aiSettingsSaveSuccess || aiSettingsSaveError)) {
      dispatch(resetAISettingsSaveState());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const toggleRole = (role: HandoverRole) => {
    const current = values.allowed_roles_for_handover;
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    setFieldValue('allowed_roles_for_handover', next);
    setFieldTouched('allowed_roles_for_handover', true, false);
  };

  const showError = (field: keyof AISettingsFormValues) =>
    touched[field] && errors[field] ? (errors[field] as string) : null;

  if (isLoadingAISettings && !aiSettings) {
    return (
      <div className="max-w-3xl mx-auto space-y-6" aria-busy="true">
        <div className="h-8 w-64 rounded bg-surface-container animate-pulse" />
        <div className="h-96 rounded-2xl bg-surface-container animate-pulse" />
      </div>
    );
  }

  if (aiSettingsLoadError && !aiSettings) {
    return (
      <div className="max-w-3xl mx-auto">
        <div
          role="alert"
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-error-container/20 border border-error/30 text-sm text-error"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {aiSettingsLoadError}
          </span>
          <button
            type="button"
            onClick={() => dispatch(fetchAISettings())}
            className="text-xs font-medium underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const botNameError = showError('bot_name');
  const instructionsError = showError('system_instructions');
  const rolesError = showError('allowed_roles_for_handover');
  const greetingError = showError('greeting_message');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">AI Assistant</h1>
          <p className="text-sm text-on-surface-variant">
            Configure how your AI assistant responds to customers and when it hands over to your team.
          </p>
        </div>
        {/* Test the saved rules and knowledge base like a customer would */}
        <button
          type="button"
          onClick={() => setSimulatorOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 transition-colors cursor-pointer shrink-0"
        >
          <FlaskConical className="w-4 h-4" />
          Try it
        </button>
      </div>
      <AISimulatorDrawer open={simulatorOpen} onClose={closeSimulator} hasUnsavedChanges={dirty} />

      {/* Auto-reply: off = the team answers every new chat (tickets still open and are filed) */}
      <div className="flex items-start gap-4 p-5 bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-sm">
        <div className="flex-1">
          <h2 className="text-base font-semibold text-on-surface">AI auto-reply</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {aiAutoReply
              ? 'On: the AI answers new chats and hands them to your team when a person is needed.'
              : 'Off: every new chat goes straight to your team, and a ticket opens for them. You can still set up and test the AI here.'}
          </p>
        </div>
        <Switch checked={aiAutoReply} onChange={toggleAutoReply} label="AI auto-reply" disabled={savingAutoReply} />
      </div>

      <form
        onSubmit={formik.handleSubmit}
        noValidate
        className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl"
      >
        <div className="flex items-start gap-3 p-6 border-b border-outline-variant/30">
          <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Assistant & automation setup</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">
              Changes apply to new customer conversations.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Saving shows a success or error toast (store/errorToastMiddleware) */}
          {/* A failed save shows as a toast */}

          {/* Bot name */}
          <div className="space-y-1.5">
            <label htmlFor="bot_name" className="block text-sm font-medium text-on-surface">
              Bot name
            </label>
            <input
              id="bot_name"
              name="bot_name"
              type="text"
              value={values.bot_name}
              onChange={handleChange}
              onBlur={handleBlur}
              aria-invalid={!!botNameError}
              className={`${inputClass} ${fieldBorder(!!botNameError)}`}
            />
            {botNameError ? (
              <p className="text-xs text-error">{botNameError}</p>
            ) : (
              <p className="text-xs text-on-surface-variant">Shown to customers as the assistant's name.</p>
            )}
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <label htmlFor="system_instructions" className="block text-sm font-medium text-on-surface">
              Custom rules & instructions
            </label>
            <textarea
              id="system_instructions"
              name="system_instructions"
              rows={6}
              value={values.system_instructions}
              onChange={handleChange}
              onBlur={handleBlur}
              aria-invalid={!!instructionsError}
              placeholder="E.g. Never offer discounts above 10%. Our return window is strictly 7 days."
              className={`${inputClass} ${fieldBorder(!!instructionsError)} resize-y`}
            />
            <div className="flex justify-between gap-3">
              <p className={`text-xs ${instructionsError ? 'text-error' : 'text-on-surface-variant'}`}>
                {instructionsError ?? 'Optional. Rules the assistant must always follow.'}
              </p>
              <span
                className={`text-xs shrink-0 ${
                  values.system_instructions.length > MAX_INSTRUCTIONS_LENGTH
                    ? 'text-error'
                    : 'text-on-surface-variant'
                }`}
              >
                {values.system_instructions.length}/{MAX_INSTRUCTIONS_LENGTH}
              </span>
            </div>
          </div>

          {/* Greeting: the menu message at the start of a visit (only when there's more than one thing to choose) */}
          <div className="space-y-1.5">
            <label htmlFor="greeting_message" className="block text-sm font-medium text-on-surface">
              Greeting message
            </label>
            <textarea
              id="greeting_message"
              name="greeting_message"
              rows={2}
              value={values.greeting_message}
              onChange={handleChange}
              onBlur={handleBlur}
              aria-invalid={!!greetingError}
              placeholder="Hi! 👋 Welcome to our store. How can we help you today?"
              className={`${inputClass} ${fieldBorder(!!greetingError)} resize-y`}
            />
            <div className="flex justify-between gap-3">
              <p className={`text-xs ${greetingError ? 'text-error' : 'text-on-surface-variant'}`}>
                {greetingError ??
                  'Optional. Sent with the "Place an order / Report a problem / Something else" buttons when a customer starts a chat with just a greeting. Leave empty for the default.'}
              </p>
              <span
                className={`text-xs shrink-0 ${
                  values.greeting_message.length > MAX_GREETING_LENGTH ? 'text-error' : 'text-on-surface-variant'
                }`}
              >
                {values.greeting_message.length}/{MAX_GREETING_LENGTH}
              </span>
            </div>
          </div>

          {/* Handover roles */}
          <fieldset className="space-y-2">
            <legend className="block text-sm font-medium text-on-surface">
              Roles notified for human handover
            </legend>
            <p className="text-xs text-on-surface-variant">
              These roles are alerted when the assistant escalates a conversation.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {HANDOVER_ROLES.map((role) => {
                const checked = values.allowed_roles_for_handover.includes(role.value);
                return (
                  <label
                    key={role.value}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                      checked
                        ? 'border-primary bg-primary/5'
                        : 'border-outline/30 bg-surface hover:bg-surface-container'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRole(role.value)}
                      className="mt-0.5 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium text-on-surface">{role.label}</span>
                      <span className="block text-xs text-on-surface-variant">{role.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {rolesError && <p className="text-xs text-error">{rolesError}</p>}
          </fieldset>

        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/30">
          {dirty && (
            <button
              type="button"
              onClick={() => formik.resetForm()}
              disabled={isSavingAISettings}
              className="px-5 py-2.5 bg-surface-container text-on-surface text-sm font-medium rounded-xl hover:bg-surface-container-high transition-all disabled:opacity-50 cursor-pointer"
            >
              Discard changes
            </button>
          )}
          <button
            type="submit"
            disabled={isSavingAISettings || !dirty}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-medium rounded-xl hover:bg-primary/90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>
              {isSavingAISettings ? 'Saving...' : 'Save configuration'}
            </span>
          </button>
        </div>
      </form>

      <KnowledgeBaseCard />
    </div>
  );
}
