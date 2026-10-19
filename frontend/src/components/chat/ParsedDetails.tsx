import { AlertCircle, Loader2, MinusCircle, Sparkles } from 'lucide-react';
import type { ParsedDocument } from '@/types/chatTypes';

/** Fields, line items and totals the parser extracted from a document. */
export function ParsedDetails({ parsed }: { parsed: ParsedDocument }) {
  return (
    <section className="space-y-4" aria-label="Extracted details">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> Extracted details
        </h3>
        {parsed.status === 'parsed' && parsed.confidence !== undefined && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              parsed.confidence >= 0.9 ? 'bg-green-500/10 text-green-700' : 'bg-amber-500/10 text-amber-700'
            }`}
            title="How confident the parser is in these values"
          >
            {Math.round(parsed.confidence * 100)}% confidence
          </span>
        )}
      </div>

      {parsed.status === 'processing' && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-surface-container text-sm text-on-surface-variant">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          Reading the document. Details will appear here shortly.
        </div>
      )}

      {parsed.status === 'skipped' && (
        <div className="flex items-start gap-2 p-4 rounded-xl bg-surface-container text-sm text-on-surface-variant">
          <MinusCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {parsed.note ?? "This file type isn't read automatically."} Open it to review manually.
          </span>
        </div>
      )}

      {parsed.status === 'failed' && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-error/10 text-sm text-error">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Couldn't read this document. Open it to review manually.
        </div>
      )}

      {parsed.status === 'parsed' && (
        <>
          {parsed.documentType && (
            <span className="inline-flex px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
              {parsed.documentType}
            </span>
          )}

          {parsed.fields && parsed.fields.length > 0 && (
            <dl className="rounded-xl border border-outline-variant/30 divide-y divide-outline-variant/30">
              {parsed.fields.map((f) => (
                <div key={f.label} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <dt className="text-xs text-on-surface-variant shrink-0">{f.label}</dt>
                  <dd className="text-xs font-medium text-on-surface text-right wrap-break-word">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {parsed.lineItems && parsed.lineItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-on-surface">Line items</h4>
              <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-surface-container text-on-surface-variant">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-2 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {parsed.lineItems.map((item) => (
                      <tr key={item.description}>
                        <td className="px-3 py-2 text-on-surface">{item.description}</td>
                        <td className="px-2 py-2 text-right text-on-surface-variant">{item.qty}</td>
                        <td className="px-3 py-2 text-right text-on-surface whitespace-nowrap">{item.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parsed.totals && parsed.totals.length > 0 && (
            <dl className="space-y-1.5 px-1">
              {parsed.totals.map((t) => (
                <div
                  key={t.label}
                  className={`flex items-center justify-between ${
                    t.emphasis
                      ? 'pt-2 mt-1 border-t border-outline-variant/30 text-sm font-bold text-on-surface'
                      : 'text-xs text-on-surface-variant'
                  }`}
                >
                  <dt>{t.label}</dt>
                  <dd className={t.emphasis ? '' : 'text-on-surface'}>{t.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </section>
  );
}
