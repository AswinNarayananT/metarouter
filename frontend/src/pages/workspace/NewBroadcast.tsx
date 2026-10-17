import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import type { FormikErrors, FormikTouched } from 'formik';
import * as Yup from 'yup';
import { AlertCircle, ArrowLeft, ArrowRight, Cable, Loader2, Send } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { createBroadcast, fetchTemplates, fetchWhatsAppNumbers, previewBroadcast } from '@/store/broadcast/broadcastThunks';
import { resetBroadcastDraft } from '@/store/broadcast/broadcastSlice';
import type { AudienceSource, BroadcastFormValues } from '@/types/broadcastTypes';
import { templateKey } from '@/utils/broadcast';
import { StepIndicator } from '@/components/broadcast/StepIndicator';
import { TemplatePicker } from '@/components/broadcast/TemplatePicker';
import { TemplateVariablesFields } from '@/components/broadcast/TemplateVariablesFields';
import { AudienceSelector } from '@/components/broadcast/AudienceSelector';
import { AudienceSummary } from '@/components/broadcast/AudienceSummary';
import { MessagePreviewBubble } from '@/components/broadcast/MessagePreviewBubble';

const MAX_CSV_BYTES = 2 * 1024 * 1024;

// Meta rejects empty values, new lines and tabs inside template variables
const variableSchema = Yup.string()
  .trim()
  .required('Enter a value')
  .test('single-line', "Values can't contain new lines or tabs", (value) => !/[\n\t]/.test(value ?? ''));

const templateStepSchema = Yup.object({
  phone_number_id: Yup.string().required('Choose a WhatsApp number'),
  template_key: Yup.string().required('Choose a template'),
  variables: Yup.array().of(variableSchema),
});

const audienceStepSchema = Yup.object({
  audience_source: Yup.mixed<AudienceSource>().oneOf(['customers', 'contacts']).required(),
  file: Yup.mixed<File>()
    .nullable()
    .when('audience_source', {
      is: 'contacts',
      then: (schema) =>
        schema
          .required('Choose a CSV file')
          .test('csv', 'Upload a .csv file', (file) => !file || file.name.toLowerCase().endsWith('.csv'))
          .test('size', 'The file must be 2 MB or smaller', (file) => !file || file.size <= MAX_CSV_BYTES),
    }),
  consent_confirmed: Yup.boolean().when('audience_source', {
    is: 'contacts',
    then: (schema) => schema.oneOf([true], 'Confirm that everyone on the list agreed to receive messages'),
  }),
});

const fullSchema = templateStepSchema.concat(audienceStepSchema);

const initialValues: BroadcastFormValues = {
  phone_number_id: '',
  template_key: '',
  variables: [],
  use_contact_name: false,
  audience_source: 'customers',
  file: null,
  consent_confirmed: false,
};

export function NewBroadcast() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const {
    numbers, isLoadingNumbers, numbersError,
    templates, isLoadingTemplates, templatesError,
    preview, isPreviewing, previewError,
    isCreating, createError,
  } = useAppSelector((state) => state.broadcast);
  const [step, setStep] = useState(1);

  const formik = useFormik<BroadcastFormValues>({
    initialValues,
    validationSchema: step === 1 ? templateStepSchema : step === 2 ? audienceStepSchema : fullSchema,
    onSubmit: async (values) => {
      const result = await dispatch(createBroadcast(values));
      if (createBroadcast.fulfilled.match(result)) {
        navigate(`/dashboard/broadcast/${result.payload.id}`);
      }
    },
  });
  const { values, setFieldValue, setValues } = formik;

  // Fresh draft every time the page opens
  useEffect(() => {
    dispatch(resetBroadcastDraft());
    dispatch(fetchWhatsAppNumbers());
    return () => {
      dispatch(resetBroadcastDraft());
    };
  }, [dispatch]);

  // Only one connected number: pick it automatically
  useEffect(() => {
    if (numbers.length === 1 && !values.phone_number_id) {
      setFieldValue('phone_number_id', numbers[0].phone_number_id);
    }
  }, [numbers, values.phone_number_id, setFieldValue]);

  useEffect(() => {
    if (values.phone_number_id) dispatch(fetchTemplates(values.phone_number_id));
  }, [dispatch, values.phone_number_id]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => templateKey(t) === values.template_key) ?? null,
    [templates, values.template_key]
  );

  const selectNumber = (phoneNumberId: string) => {
    setValues({ ...values, phone_number_id: phoneNumberId, template_key: '', variables: [], use_contact_name: false });
  };

  const selectTemplate = (key: string) => {
    const template = templates.find((t) => templateKey(t) === key);
    setValues({ ...values, template_key: key, use_contact_name: false, variables: Array(template?.variable_count ?? 0).fill('') });
  };

  // With the name filling {{1}}, the admin only types {{2}} onwards
  const toggleContactName = (checked: boolean) => {
    const variables = checked ? values.variables.slice(1) : ['', ...values.variables];
    setValues({ ...values, use_contact_name: checked, variables });
  };

  const touchStep = (current: number): FormikTouched<BroadcastFormValues> =>
    current === 1
      ? { ...formik.touched, phone_number_id: true, template_key: true, variables: true }
      : { ...formik.touched, audience_source: true, file: true, consent_confirmed: true };

  const stepHasErrors = (current: number, errors: FormikErrors<BroadcastFormValues>) =>
    current === 1
      ? !!(errors.phone_number_id || errors.template_key || errors.variables)
      : !!(errors.audience_source || errors.file || errors.consent_confirmed);

  const goNext = async () => {
    const errors = await formik.validateForm();
    formik.setTouched(touchStep(step), false);
    if (stepHasErrors(step, errors)) return;

    if (step === 2) {
      dispatch(previewBroadcast(values));
    }
    setStep(step + 1);
  };

  const goBack = () => {
    dispatch(resetBroadcastDraft());
    setStep(step - 1);
  };

  const variableErrors = (Array.isArray(formik.errors.variables) ? formik.errors.variables : []) as (string | undefined)[];
  // Touched is `true` for the whole list after "Next", or per field after a blur
  const touchedVariables = formik.touched.variables as unknown;
  const variableTouched = values.variables.map((_, i) =>
    touchedVariables === true || (Array.isArray(touchedVariables) && !!touchedVariables[i])
  );
  const canSend = !!preview && preview.queued_count > 0 && !preview.tier_error && !isCreating;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-3">
        <Link to="/dashboard/broadcast" className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface">
          <ArrowLeft className="w-4 h-4" /> Broadcasts
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">New broadcast</h1>
        <StepIndicator current={step} />
      </div>

      <form
        onSubmit={formik.handleSubmit}
        noValidate
        className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl"
      >
        <div className="p-5 sm:p-6 space-y-6">
          {/* ---------- Step 1: number, template, variables ---------- */}
          {step === 1 && (
            <>
              {isLoadingNumbers && numbers.length === 0 ? (
                <div className="h-11 rounded-xl bg-surface-container animate-pulse" aria-busy="true" />
              ) : numbersError ? (
                <p className="flex items-center gap-2 text-sm text-error"><AlertCircle className="w-4 h-4" /> {numbersError}</p>
              ) : numbers.length === 0 ? (
                <div className="flex flex-col items-center text-center gap-3 py-8">
                  <span className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <Cable className="w-6 h-6" />
                  </span>
                  <p className="text-sm font-semibold text-on-surface">No WhatsApp number connected</p>
                  <p className="text-sm text-on-surface-variant max-w-sm">Connect your WhatsApp Business number before sending broadcasts.</p>
                  <Link to="/dashboard/channels" className="text-sm font-medium text-primary hover:underline">Go to Channels</Link>
                </div>
              ) : (
                <>
                  {numbers.length > 1 && (
                    <div className="space-y-1.5">
                      <label htmlFor="phone_number_id" className="block text-sm font-medium text-on-surface">Send from</label>
                      <select
                        id="phone_number_id"
                        value={values.phone_number_id}
                        onChange={(e) => selectNumber(e.target.value)}
                        className="w-full px-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
                      >
                        <option value="">Choose a WhatsApp number</option>
                        {numbers.map((n) => (
                          <option key={n.phone_number_id} value={n.phone_number_id}>{n.display_phone_number}</option>
                        ))}
                      </select>
                      {formik.touched.phone_number_id && formik.errors.phone_number_id && (
                        <p className="text-xs text-error">{formik.errors.phone_number_id}</p>
                      )}
                    </div>
                  )}

                  {values.phone_number_id && (
                    <section className="space-y-3" aria-label="Template">
                      <h2 className="text-sm font-semibold text-on-surface">Choose a template</h2>
                      {isLoadingTemplates ? (
                        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
                          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-surface-container animate-pulse" />)}
                        </div>
                      ) : templatesError ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-xl bg-error/10 text-sm text-error">
                          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {templatesError}</span>
                          <button type="button" onClick={() => dispatch(fetchTemplates(values.phone_number_id))} className="text-xs font-medium underline cursor-pointer">
                            Retry
                          </button>
                        </div>
                      ) : templates.length === 0 ? (
                        <p className="text-sm text-on-surface-variant">No approved templates yet. Create one in WhatsApp Manager and it will appear here once approved.</p>
                      ) : (
                        <TemplatePicker
                          templates={templates}
                          value={values.template_key}
                          onChange={selectTemplate}
                          error={formik.touched.template_key ? formik.errors.template_key : undefined}
                        />
                      )}
                    </section>
                  )}

                  {selectedTemplate && (
                    <section className="space-y-3 pt-2 border-t border-outline-variant/30" aria-label="Template values">
                      <h2 className="text-sm font-semibold text-on-surface pt-4">Fill in the template</h2>
                      <TemplateVariablesFields
                        template={selectedTemplate}
                        variables={values.variables}
                        useContactName={values.use_contact_name}
                        errors={values.variables.map((_, i) => (variableTouched[i] ? variableErrors[i] : undefined))}
                        onVariableChange={(index, value) => setFieldValue(`variables.${index}`, value)}
                        onVariableBlur={(index) => formik.setFieldTouched(`variables.${index}`, true)}
                        onToggleContactName={toggleContactName}
                      />
                    </section>
                  )}
                </>
              )}
            </>
          )}

          {/* ---------- Step 2: audience ---------- */}
          {step === 2 && (
            <section className="space-y-3" aria-label="Audience">
              <h2 className="text-sm font-semibold text-on-surface">Who should receive it?</h2>
              <p className="text-xs text-on-surface-variant">
                Duplicates, invalid numbers, customers who opted out and anyone you messaged in the last 7 days are left out automatically.
              </p>
              <AudienceSelector
                source={values.audience_source}
                file={values.file}
                consentConfirmed={values.consent_confirmed}
                errors={{
                  file: formik.touched.file ? (formik.errors.file as string | undefined) : undefined,
                  consent_confirmed: formik.touched.consent_confirmed ? formik.errors.consent_confirmed : undefined,
                }}
                onSourceChange={(source) => setFieldValue('audience_source', source)}
                onFileChange={(file) => {
                  setFieldValue('file', file);
                  formik.setFieldTouched('file', true, false);
                }}
                onConsentChange={(value) => setFieldValue('consent_confirmed', value)}
              />
            </section>
          )}

          {/* ---------- Step 3: review & send ---------- */}
          {step === 3 && (
            <section className="space-y-5" aria-label="Review">
              {isPreviewing ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-on-surface-variant">
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking your audience…
                </div>
              ) : previewError ? (
                <div role="alert" className="flex items-start gap-2 px-4 py-3 rounded-xl bg-error/10 text-sm text-error">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{previewError}</span>
                </div>
              ) : preview ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  <AudienceSummary counts={preview} tierError={preview.tier_error} />
                  <MessagePreviewBubble text={preview.sample_message} label={`Example · ${preview.template.name}`} />
                </div>
              ) : null}

              {createError && (
                <div role="alert" className="flex items-start gap-2 px-4 py-3 rounded-xl bg-error/10 text-sm text-error">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ---------- Actions ---------- */}
        {numbers.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-outline-variant/30">
            {step === 1 ? (
              <Link to="/dashboard/broadcast" className="px-5 py-2.5 rounded-xl bg-surface-container text-on-surface text-sm font-medium hover:bg-surface-container-high transition-colors">
                Cancel
              </Link>
            ) : (
              <button
                type="button"
                onClick={goBack}
                disabled={isCreating}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface-container text-on-surface text-sm font-medium hover:bg-surface-container-high transition-colors disabled:opacity-50 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium shadow-md hover:bg-primary/90 transition-colors cursor-pointer"
              >
                {step === 2 ? 'Check audience' : 'Next'} <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isCreating ? 'Sending…' : `Send to ${preview?.queued_count.toLocaleString() ?? 0}`}
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
