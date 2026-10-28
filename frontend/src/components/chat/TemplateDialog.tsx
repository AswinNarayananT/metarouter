import { useEffect, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import { TemplatePicker } from '@/components/broadcast/TemplatePicker';
import { MessagePreviewBubble } from '@/components/broadcast/MessagePreviewBubble';
import { renderTemplateBody, templateKey } from '@/utils/broadcast';
import type { BroadcastTemplate } from '@/types/broadcastTypes';

/**
 * Pick an approved WhatsApp template, fill its {{1}}, {{2}} ... and send it to this customer.
 * Works outside the 24-hour window; the customer's reply reopens free text.
 * A failed send shows as a toast and the dialog stays open.
 */
export function TemplateDialog({
  conversationId,
  customerName,
  busy,
  onCancel,
  onSend,
}: {
  conversationId: number;
  customerName: string | null; // Pre-fills {{1}} (usually the greeting name)
  busy: boolean;
  onCancel: () => void;
  onSend: (template: BroadcastTemplate, parameters: string[]) => void;
}) {
  const [state, setState] = useState<{ templates: BroadcastTemplate[]; loading: boolean; loadError: string | null }>({ templates: [], loading: true, loadError: null });
  const [selectedKey, setSelectedKey] = useState('');
  const [values, setValues] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ templates: BroadcastTemplate[] }>(`/api/v1/conversations/${conversationId}/templates`)
      .then((response) => !cancelled && setState({ templates: response.data.templates, loading: false, loadError: null }))
      .catch((err) => !cancelled && setState({ templates: [], loading: false, loadError: getApiErrorMessage(err, 'Could not load templates') }));
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const template = state.templates.find((t) => templateKey(t) === selectedKey);

  // Choosing a template resets its fields; {{1}} starts as the customer's name
  const choose = (key: string) => {
    const next = state.templates.find((t) => templateKey(t) === key);
    setSelectedKey(key);
    setValues(Array.from({ length: next?.variable_count ?? 0 }, (_, i) => (i === 0 && customerName ? customerName : '')));
  };

  const complete = Boolean(template) && values.every((v) => v.trim());

  return (
    <div role="dialog" aria-modal="true" aria-label="Send a template" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !busy && onCancel()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Send a template</h2>
            <p className="text-xs text-on-surface-variant">Approved WhatsApp templates can be sent any time. When the customer replies, you can chat freely again.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {state.loading && (
            <p className="flex items-center gap-2 text-sm text-on-surface-variant">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading templates from WhatsApp…
            </p>
          )}
          {state.loadError && <p className="text-sm text-error">{state.loadError}</p>}
          {!state.loading && !state.loadError && state.templates.length === 0 && (
            <p className="text-sm text-on-surface-variant">No approved templates yet. Create one in WhatsApp Manager first.</p>
          )}
          {state.templates.length > 0 && <TemplatePicker templates={state.templates} value={selectedKey} onChange={choose} />}

          {template && (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                {template.variable_count === 0 && <p className="text-sm text-on-surface-variant">This template has no fields to fill in.</p>}
                {values.map((value, index) => (
                  <label key={index} className="block space-y-1">
                    <span className="text-xs font-medium text-on-surface">
                      Value for {`{{${index + 1}}}`}
                      {index === 0 && customerName && <span className="font-normal text-on-surface-variant"> (customer's name)</span>}
                    </span>
                    <input
                      value={value}
                      maxLength={1024}
                      onChange={(e) => setValues((current) => current.map((v, i) => (i === index ? e.target.value : v)))}
                      className="w-full px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
                    />
                  </label>
                ))}
              </div>
              <MessagePreviewBubble text={renderTemplateBody(template.body_text, values)} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-xl text-sm text-on-surface hover:bg-surface-container cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => template && onSend(template, values.map((v) => v.trim()))}
            disabled={!complete || busy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send template
          </button>
        </div>
      </div>
    </div>
  );
}
