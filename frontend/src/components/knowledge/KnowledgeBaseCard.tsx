import { useEffect } from 'react';
import { AlertCircle, BookOpen } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  deleteKnowledgeDocument,
  fetchKnowledgeDocuments,
  retryKnowledgeDocument,
  uploadKnowledgeDocument,
} from '@/store/knowledge/knowledgeThunks';
import { clearKnowledgeErrors } from '@/store/knowledge/knowledgeSlice';
import { KnowledgeUpload } from './KnowledgeUpload';
import { KnowledgeDocumentList } from './KnowledgeDocumentList';

const POLL_INTERVAL_MS = 5000;

export function KnowledgeBaseCard() {
  const dispatch = useAppDispatch();
  const { documents, maxDocuments, isLoading, loadError, isUploading, busyIds } = useAppSelector(
    (state) => state.knowledge
  );

  useEffect(() => {
    dispatch(fetchKnowledgeDocuments());
    return () => {
      dispatch(clearKnowledgeErrors());
    };
  }, [dispatch]);

  // Refresh while a PDF is still being processed in the background
  const hasProcessing = documents.some((d) => d.status === 'processing');
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = window.setInterval(() => dispatch(fetchKnowledgeDocuments()), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [dispatch, hasProcessing]);

  const handleUpload = async (file: File) => {
    const result = await dispatch(uploadKnowledgeDocument(file));
    return uploadKnowledgeDocument.fulfilled.match(result);
  };

  const limitReached = maxDocuments !== null && documents.length >= maxDocuments;

  return (
    <section
      aria-label="Knowledge base"
      className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl"
    >
      <div className="flex items-start gap-3 p-6 border-b border-outline-variant/30">
        <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-on-surface">Knowledge base</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Manuals and policies the assistant answers from. PDFs are processed in the background.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Failed uploads, retries and deletes show as toasts */}
        <KnowledgeUpload isUploading={isUploading} disabled={limitReached} onUpload={handleUpload} />

        {isLoading && documents.length === 0 ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1].map((i) => <div key={i} className="h-16 rounded-xl bg-surface-container animate-pulse" />)}
          </div>
        ) : loadError && documents.length === 0 ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-error/10 text-sm text-error">
            <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {loadError}</span>
            <button type="button" onClick={() => dispatch(fetchKnowledgeDocuments())} className="text-xs font-medium underline cursor-pointer">
              Retry
            </button>
          </div>
        ) : (
          <KnowledgeDocumentList
            documents={documents}
            busyIds={busyIds}
            onRetry={(id) => dispatch(retryKnowledgeDocument(id))}
            onDelete={(id) => dispatch(deleteKnowledgeDocument(id))}
          />
        )}

        {maxDocuments !== null && documents.length > 0 && (
          <p className="text-xs text-on-surface-variant">{documents.length} of {maxDocuments} documents</p>
        )}
      </div>
    </section>
  );
}
