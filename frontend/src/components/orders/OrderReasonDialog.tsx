import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

const REASON_MAX_CHARS = 300;

/** Reject or cancel an order: the reason is required. A rejection's reason is sent to the customer.
 *  A failed save shows as a toast and the dialog stays open. */
export function OrderReasonDialog({
  orderNumber,
  action,
  stockReturns,
  busy,
  onCancel,
  onConfirm,
}: {
  orderNumber: number;
  action: 'rejected' | 'cancelled';
  stockReturns: boolean; // Cancelling an accepted order gives its stock back
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const reject = action === 'rejected';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const title = reject ? `Reject order #${orderNumber}` : `Cancel order #${orderNumber}`;

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !busy && onCancel()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-on-surface">{reject ? 'Why can’t you take this order?' : 'Why is it cancelled?'}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={REASON_MAX_CHARS}
              autoFocus
              placeholder={reject ? 'e.g. We don’t deliver to that area yet' : 'e.g. Customer called to cancel'}
              className="w-full px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary resize-none"
            />
          </label>
          <p className="text-xs text-on-surface-variant">
            {reject
              ? 'The customer gets this reason on WhatsApp.'
              : 'Only your team sees this. The customer isn’t messaged, so tell them in the chat if needed.'}
            {stockReturns && ' The stock goes back to Products.'}
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-xl text-sm text-on-surface hover:bg-surface-container cursor-pointer">
            Back
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={!reason.trim() || busy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-error text-on-error text-sm font-medium hover:bg-error/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {reject ? 'Reject order' : 'Cancel order'}
          </button>
        </div>
      </div>
    </div>
  );
}
