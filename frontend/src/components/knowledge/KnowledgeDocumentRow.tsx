import { useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, RotateCw, Trash2 } from 'lucide-react';
import type { KnowledgeDocument } from '@/types/knowledgeTypes';
import { formatDateTime } from '@/utils/broadcast';
import { formatFileSize } from '@/utils/knowledge';

interface KnowledgeDocumentRowProps {
  document: KnowledgeDocument;
  busy: boolean;
  onRetry: (id: number) => void;
  onDelete: (id: number) => void;
}

export function KnowledgeDocumentRow({ document, busy, onRetry, onDelete }: KnowledgeDocumentRowProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const details = [
    document.file_size !== null ? formatFileSize(document.file_size) : null,
    document.page_count ? `${document.page_count} page${document.page_count === 1 ? '' : 's'}` : null,
    document.created_at ? formatDateTime(document.created_at) : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3 rounded-xl border border-outline-variant/30 bg-surface">
      <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-on-surface truncate">{document.file_name}</p>
        {details.length > 0 && <p className="text-xs text-on-surface-variant">{details.join(' · ')}</p>}

        {document.status === 'processing' && (
          <p className="inline-flex items-center gap-1.5 text-xs text-primary">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing — the assistant can use it once it's ready
          </p>
        )}
        {document.status === 'ready' && (
          <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ready · {document.chunk_count} part{document.chunk_count === 1 ? '' : 's'}
          </p>
        )}
        {document.status === 'failed' && (
          <p className="flex items-start gap-1.5 text-xs text-error">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {document.error || 'Processing failed'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {confirmingDelete ? (
          <>
            <span className="text-xs text-on-surface-variant">Delete?</span>
            <button
              type="button"
              onClick={() => onDelete(document.id)}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-error text-on-error text-xs font-medium hover:bg-error/90 disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-medium hover:bg-surface-container-high disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {document.can_retry && (
              <button
                type="button"
                onClick={() => onRetry(document.id)}
                disabled={busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-medium hover:bg-surface-container-high disabled:opacity-50 cursor-pointer"
              >
                <RotateCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              aria-label={`Delete ${document.file_name}`}
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
