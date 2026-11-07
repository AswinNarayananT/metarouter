import { useEffect } from 'react';
import { Loader2, X } from 'lucide-react';

/** A failed delete shows as a toast and the dialog stays open. */
export function DeleteTemplateDialog({
  name,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Delete template" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !busy && onCancel()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <h2 className="text-sm font-semibold text-on-surface">Delete {name}?</h2>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="p-5 text-sm text-on-surface-variant">
          This removes it from your WhatsApp Business account in every language. It can't be undone, and Meta won't let you use this name again for 30 days.
        </p>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30">
          <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-xl text-sm text-on-surface hover:bg-surface-container cursor-pointer">
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-error text-on-error text-sm font-medium hover:bg-error/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Delete template
          </button>
        </div>
      </div>
    </div>
  );
}
