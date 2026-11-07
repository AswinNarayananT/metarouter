import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Cable, Copy, FileText, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchWhatsAppNumbers } from '@/store/broadcast/broadcastThunks';
import { createMessageTemplate, deleteMessageTemplate, fetchMessageTemplates } from '@/store/templates/templatesThunks';
import { DeleteTemplateDialog } from '@/components/templates/DeleteTemplateDialog';
import { TemplateFormDialog } from '@/components/templates/TemplateFormDialog';
import { TemplateStatusBadge } from '@/components/templates/TemplateStatusBadge';
import type { TemplateFormValues } from '@/types/templateTypes';
import { copyOfTemplate, rejectedReasonText, TEMPLATE_CATEGORIES, TEMPLATE_LANGUAGES, templateKey } from '@/utils/template';

const EMPTY_FORM: TemplateFormValues = { name: '', category: 'UTILITY', language: 'en', body: '', examples: [] };

export function Templates() {
  const dispatch = useAppDispatch();
  const { numbers, isLoadingNumbers, numbersError } = useAppSelector((state) => state.broadcast);
  const { items, isLoading, error, isSaving, isDeleting } = useAppSelector((state) => state.templates);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [draft, setDraft] = useState<TemplateFormValues | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchWhatsAppNumbers());
  }, [dispatch]);

  // Start on the first working number
  useEffect(() => {
    if (!phoneNumberId && numbers.length > 0) {
      setPhoneNumberId((numbers.find((n) => n.status !== 'disconnected') ?? numbers[0]).phone_number_id);
    }
  }, [numbers, phoneNumberId]);

  const selectedNumber = numbers.find((n) => n.phone_number_id === phoneNumberId);
  const numberDisconnected = selectedNumber?.status === 'disconnected';

  const refresh = useCallback(() => {
    if (phoneNumberId && !numberDisconnected) dispatch(fetchMessageTemplates(phoneNumberId));
  }, [dispatch, phoneNumberId, numberDisconnected]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const closeForm = useCallback(() => setDraft(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const submit = async (values: TemplateFormValues) => {
    const result = await dispatch(createMessageTemplate({ phoneNumberId, values }));
    if (createMessageTemplate.fulfilled.match(result)) {
      setDraft(null);
      refresh();
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await dispatch(deleteMessageTemplate({ phoneNumberId, name: deleting }));
    if (deleteMessageTemplate.fulfilled.match(result)) setDeleting(null);
  };

  if (isLoadingNumbers && numbers.length === 0) {
    return <div className="h-40 rounded-2xl bg-surface-container animate-pulse" aria-busy="true" />;
  }
  if (numbersError) {
    return <p className="flex items-center gap-2 text-sm text-error"><AlertCircle className="w-4 h-4" /> {numbersError}</p>;
  }
  if (numbers.length === 0) {
    return (
      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl p-10 flex flex-col items-center text-center gap-3">
        <span className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Cable className="w-7 h-7" />
        </span>
        <h2 className="text-base font-semibold text-on-surface">No WhatsApp number connected</h2>
        <p className="text-sm text-on-surface-variant max-w-sm">Templates live on your WhatsApp Business account, so connect a number first.</p>
        <Link to="/dashboard/channels" className="text-sm font-medium text-primary hover:underline">Go to Channels</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {numbers.length > 1 && (
            <select
              aria-label="WhatsApp number"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              className="px-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
            >
              {numbers.map((n) => (
                <option key={n.phone_number_id} value={n.phone_number_id}>
                  {n.display_phone_number}{n.status === 'disconnected' ? ' (disconnected)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading || numberDisconnected}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-outline/30 text-sm text-on-surface hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setDraft(EMPTY_FORM)}
            disabled={numberDisconnected}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium shadow-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> New template
          </button>
        </div>
      </div>

      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl overflow-hidden">
        {numberDisconnected ? (
          <p role="alert" className="p-8 text-center text-sm text-error">
            This number is disconnected, so its templates can't be loaded. {selectedNumber?.disconnect_message}{' '}
            <Link to="/dashboard/channels" className="font-medium underline">Reconnect in Channels</Link>
          </p>
        ) : isLoading && items.length === 0 ? (
          <div className="p-6 space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <p className="flex items-center justify-center gap-2 text-sm text-error">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </p>
            <button type="button" onClick={refresh} className="text-xs font-medium text-primary hover:underline cursor-pointer">
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 flex flex-col items-center text-center gap-3">
            <span className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <FileText className="w-7 h-7" />
            </span>
            <h2 className="text-base font-semibold text-on-surface">No templates yet</h2>
            <p className="text-sm text-on-surface-variant max-w-sm">
              Templates let you message customers outside WhatsApp's 24-hour reply window. Meta reviews each one first.
            </p>
            <button type="button" onClick={() => setDraft(EMPTY_FORM)} className="text-sm font-medium text-primary hover:underline cursor-pointer">
              Create your first template
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/30">
            {items.map((template) => (
              <li key={templateKey(template)} className="p-4 sm:p-5 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-on-surface break-all">{template.name}</span>
                  <TemplateStatusBadge status={template.status} />
                  <span className="text-xs text-on-surface-variant">
                    {TEMPLATE_CATEGORIES.find((c) => c.value === template.category)?.label ?? template.category}
                    {' · '}
                    {TEMPLATE_LANGUAGES.find((l) => l.value === template.language)?.label ?? template.language}
                    {template.app_template && ' · Used for order updates'}
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant whitespace-pre-wrap break-words">{template.body_text}</p>
                {template.status === 'REJECTED' && (
                  <p className="text-xs text-error">{rejectedReasonText(template.rejected_reason)}</p>
                )}
                {!template.supported && <p className="text-xs text-on-surface-variant">{template.unsupported_reason}</p>}
                <div className="flex items-center gap-3">
                  {template.status === 'REJECTED' && (
                    <button type="button" onClick={() => setDraft(copyOfTemplate(template))} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer">
                      <Copy className="w-3.5 h-3.5" /> Copy to new
                    </button>
                  )}
                  {!template.app_template && (
                    <button type="button" onClick={() => setDeleting(template.name)} className="inline-flex items-center gap-1 text-xs font-medium text-error hover:underline cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {draft && <TemplateFormDialog initialValues={draft} busy={isSaving} onCancel={closeForm} onSubmit={submit} />}
      {deleting && <DeleteTemplateDialog name={deleting} busy={isDeleting} onCancel={closeDelete} onConfirm={confirmDelete} />}
    </div>
  );
}
