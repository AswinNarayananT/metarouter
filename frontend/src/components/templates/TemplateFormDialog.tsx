import { useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Loader2, Plus, X } from 'lucide-react';
import type { TemplateFormValues } from '@/types/templateTypes';
import {
  APP_TEMPLATE_PREFIX,
  bodyProblem,
  bodyVariables,
  fillVariables,
  TEMPLATE_BODY_MAX_CHARS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  TEMPLATE_NAME_MAX_CHARS,
} from '@/utils/template';

const FIELD_CLASS = 'w-full px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary';

const schema = Yup.object({
  name: Yup.string()
    .required('Enter a name')
    .max(TEMPLATE_NAME_MAX_CHARS, `Up to ${TEMPLATE_NAME_MAX_CHARS} characters`)
    .matches(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only')
    .test('reserved', `Names starting with ${APP_TEMPLATE_PREFIX} are kept for the app's own templates`, (value) => !value?.startsWith(APP_TEMPLATE_PREFIX)),
  body: Yup.string()
    .trim()
    .required('Enter the message')
    .max(TEMPLATE_BODY_MAX_CHARS, `Up to ${TEMPLATE_BODY_MAX_CHARS} characters`)
    .test('variables', 'Check the variables', function (value) {
      const problem = bodyProblem(value ?? '');
      return problem ? this.createError({ message: problem }) : true;
    }),
  examples: Yup.array().of(
    Yup.string()
      .trim()
      .required('Enter an example')
      .test('single-line', "Examples can't contain new lines or tabs", (value) => !/[\n\t]/.test(value ?? ''))
  ),
});

/** Write a template and send it to Meta. A failed send shows as a toast and the dialog stays open. */
export function TemplateFormDialog({
  initialValues,
  busy,
  onCancel,
  onSubmit,
}: {
  initialValues: TemplateFormValues;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: TemplateFormValues) => void;
}) {
  const formik = useFormik<TemplateFormValues>({
    initialValues,
    validationSchema: schema,
    onSubmit: (values) => onSubmit({ ...values, body: values.body.trim(), examples: values.examples.map((example) => example.trim()) }),
  });
  const { values, errors, touched, setFieldValue } = formik;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  // One example box for each variable in the message
  const variables = bodyVariables(values.body);
  useEffect(() => {
    if (values.examples.length !== variables.length) {
      setFieldValue('examples', variables.map((_, index) => values.examples[index] ?? ''));
    }
  }, [variables.length, values.examples, setFieldValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const addVariable = () => setFieldValue('body', `${values.body}{{${variables.length + 1}}}`);
  const languages = TEMPLATE_LANGUAGES.some((language) => language.value === values.language)
    ? TEMPLATE_LANGUAGES
    : [...TEMPLATE_LANGUAGES, { value: values.language, label: values.language }];
  const category = TEMPLATE_CATEGORIES.find((option) => option.value === values.category);
  const exampleErrors = Array.isArray(errors.examples) ? errors.examples : [];

  return (
    <div role="dialog" aria-modal="true" aria-label="New template" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !busy && onCancel()}>
      <form
        onSubmit={formik.handleSubmit}
        noValidate
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-full flex flex-col rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <h2 className="text-sm font-semibold text-on-surface">New template</h2>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-on-surface">Name</span>
            <input
              name="name"
              value={values.name}
              onChange={(e) => setFieldValue('name', e.target.value.toLowerCase().replace(/\s/g, '_'))}
              onBlur={formik.handleBlur}
              maxLength={TEMPLATE_NAME_MAX_CHARS}
              autoFocus
              placeholder="e.g. appointment_reminder"
              className={FIELD_CLASS}
            />
            {touched.name && errors.name && <span className="block text-xs text-error">{errors.name}</span>}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-on-surface">Category</span>
              <select name="category" value={values.category} onChange={formik.handleChange} className={FIELD_CLASS}>
                {TEMPLATE_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-on-surface">Language</span>
              <select name="language" value={values.language} onChange={formik.handleChange} className={FIELD_CLASS}>
                {languages.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-on-surface-variant">{category?.hint}</p>

          <label className="block space-y-1.5">
            <span className="flex items-center justify-between">
              <span className="text-xs font-medium text-on-surface">Message</span>
              <span className="text-xs text-on-surface-variant">{values.body.length} / {TEMPLATE_BODY_MAX_CHARS}</span>
            </span>
            <textarea
              name="body"
              value={values.body}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              rows={5}
              maxLength={TEMPLATE_BODY_MAX_CHARS}
              placeholder="e.g. Your appointment is on {{1}}. Reply here if you need to change it."
              className={`${FIELD_CLASS} resize-none`}
            />
            {(touched.body || values.body) && errors.body && <span className="block text-xs text-error">{errors.body}</span>}
          </label>
          <button type="button" onClick={addVariable} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Add variable
          </button>

          {variables.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-on-surface-variant">Meta's reviewers see these examples. Customers never do.</p>
              {variables.map((variable, index) => (
                <label key={variable} className="block space-y-1">
                  <span className="text-xs font-medium text-on-surface">Example for {`{{${variable}}}`}</span>
                  <input
                    name={`examples.${index}`}
                    value={values.examples[index] ?? ''}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    maxLength={200}
                    className={FIELD_CLASS}
                  />
                  {Array.isArray(touched.examples) && touched.examples[index] && exampleErrors[index] && (
                    <span className="block text-xs text-error">{exampleErrors[index]}</span>
                  )}
                </label>
              ))}
            </div>
          )}

          {values.body.trim() && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-on-surface">Preview</p>
              <p className="px-3 py-2 rounded-xl bg-surface text-sm text-on-surface whitespace-pre-wrap break-words">{fillVariables(values.body.trim(), values.examples)}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-xl text-sm text-on-surface hover:bg-surface-container cursor-pointer">
            Back
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send for approval
          </button>
        </div>
      </form>
    </div>
  );
}
