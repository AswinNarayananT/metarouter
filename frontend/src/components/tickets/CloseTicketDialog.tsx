import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';

/** Close a ticket from the dashboard: how it was solved (required) and whether the AI takes the chat back. */
export function CloseTicketDialog({
  ticketNumber,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  ticketNumber: number;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (resolution: string, handBackToAi: boolean) => void;
}) {
  const [resolution, setResolution] = useState('');
  const [handBack, setHandBack] = useState(true);
  const valid = resolution.trim().length >= 3;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Close ticket #${ticketNumber}`} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !busy && onCancel()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <h2 className="text-sm font-semibold text-on-surface">Close ticket #{ticketNumber}</h2>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Cancel" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-on-surface">How was it solved?</span>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={4}
              autoFocus
              placeholder="e.g. Re-sent the fee receipt to the customer's email"
              className="w-full px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary resize-none"
            />
          </label>

          <label className="flex items-start gap-2 text-sm text-on-surface cursor-pointer">
            <input type="checkbox" checked={handBack} onChange={(e) => setHandBack(e.target.checked)} className="mt-0.5 accent-primary" />
            <span>
              Hand the chat back to the AI
              <span className="block text-xs text-on-surface-variant">The AI answers the customer's next message, which starts a new ticket.</span>
            </span>
          </label>

          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-xl text-sm text-on-surface hover:bg-surface-container cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(resolution.trim(), handBack)}
            disabled={!valid || busy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Close ticket
          </button>
        </div>
      </div>
    </div>
  );
}
