import { useEffect, useMemo, useRef } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { AlertCircle, Bot, CheckCircle2, FileText, Save, Upload, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchAISettings, saveAISettings } from '@/store/workspace/workspaceThunks';
import { resetAISettingsSaveState } from '@/store/workspace/workspaceSlice';
import type { HandoverRole } from '@/types/workspaceTypes';

const MAX_INSTRUCTIONS_LENGTH = 4000;
const MAX_PDF_SIZE_MB = 10;
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;

const HANDOVER_ROLES: { value: HandoverRole; label: string; description: string }[] = [
  { value: 'admin', label: 'Administrator', description: 'Workspace admins' },
  { value: 'manager', label: 'Manager', description: 'Team managers' },
  { value: 'service', label: 'Service', description: 'Support staff' },
];

interface AISettingsFormValues {
  bot_name: string;
  system_instructions: string;
  allowed_roles_for_handover: HandoverRole[];
  file: File | null;
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
  file: Yup.mixed<File>()
    .nullable()
    .test('fileType', 'Only PDF files are allowed', (file) =>
      !file || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    )
    .test('fileSize', `PDF must be ${MAX_PDF_SIZE_MB} MB or smaller`, (file) =>
      !file || file.size <= MAX_PDF_SIZE_BYTES
    ),
});

const inputClass =
  'w-full px-4 py-2.5 bg-surface border rounded-xl text-sm text-on-surface focus:outline-none transition-colors';

function fieldBorder(hasError: boolean) {
  return hasError ? 'border-error focus:border-error' : 'border-outline/30 focus:border-primary';
}

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AISettingsPage() {
  const dispatch = useAppDispatch();
  const {
    aiSettings,
    isLoadingAISettings,
    aiSettingsLoadError,
    isSavingAISettings,
    aiSettingsSaveSuccess,
    aiSettingsSaveError,
  } = useAppSelector((state) => state.workspace);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      file: null,
    }),
    [aiSettings]
  );

  const formik = useFormik<AISettingsFormValues>({
    initialValues,
    enableReinitialize: true, // re-sync with the store after load / save
    validationSchema,
    onSubmit: async (values) => {
      const result = await dispatch(
        saveAISettings({
          bot_name: values.bot_name.trim(),
          system_instructions: values.system_instructions.trim(),
          allowed_roles_for_handover: values.allowed_roles_for_handover,
          file: values.file,
        })
      );
      if (saveAISettings.fulfilled.match(result) && fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setFieldValue('file', file);
    setFieldTouched('file', true, false);
  };

  const clearFile = () => {
    setFieldValue('file', null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
  const fileError = showError('file');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">AI Assistant</h1>
        <p className="text-sm text-on-surface-variant">
          Configure how your AI assistant responds to customers and when it hands over to your team.
        </p>
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
          {aiSettingsSaveSuccess && (
            <div
              role="status"
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-primary/10 border border-primary/30 text-sm text-on-surface"
            >
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <span>AI assistant settings saved successfully.</span>
            </div>
          )}

          {aiSettingsSaveError && (
            <div
              role="alert"
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-error-container/20 border border-error/30 text-sm text-error"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{aiSettingsSaveError}</span>
            </div>
          )}

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

          {/* Knowledge base PDF */}
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-on-surface">Knowledge base (PDF)</span>
            <p className="text-xs text-on-surface-variant">
              Upload manuals or policies for the assistant to answer from. Max {MAX_PDF_SIZE_MB} MB.
            </p>

            {values.file ? (
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border bg-surface ${fieldBorder(!!fileError)}`}
              >
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-on-surface truncate">{values.file.name}</p>
                  <p className="text-xs text-on-surface-variant">{formatFileSize(values.file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  aria-label="Remove file"
                  className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label
                htmlFor="knowledge_file"
                className="flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border border-dashed border-outline/40 bg-surface hover:bg-surface-container transition-colors cursor-pointer text-center"
              >
                <Upload className="w-5 h-5 text-on-surface-variant" />
                <span className="text-sm text-on-surface">Click to choose a PDF</span>
              </label>
            )}
            <input
              ref={fileInputRef}
              id="knowledge_file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              className="sr-only"
            />
            {fileError && <p className="text-xs text-error">{fileError}</p>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/30">
          {dirty && (
            <button
              type="button"
              onClick={() => {
                formik.resetForm();
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
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
              {isSavingAISettings
                ? values.file
                  ? 'Processing & embedding...'
                  : 'Saving...'
                : 'Save configuration'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
