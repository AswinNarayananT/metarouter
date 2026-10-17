import type { KnowledgeDocument } from '@/types/knowledgeTypes';
import { KnowledgeDocumentRow } from './KnowledgeDocumentRow';

interface KnowledgeDocumentListProps {
  documents: KnowledgeDocument[];
  busyIds: number[];
  onRetry: (id: number) => void;
  onDelete: (id: number) => void;
}

export function KnowledgeDocumentList({ documents, busyIds, onRetry, onDelete }: KnowledgeDocumentListProps) {
  if (documents.length === 0) {
    return <p className="text-sm text-on-surface-variant">No documents yet. The assistant answers from your instructions only.</p>;
  }

  return (
    <ul className="space-y-2" aria-label="Knowledge base documents">
      {documents.map((document) => (
        <KnowledgeDocumentRow
          key={document.id}
          document={document}
          busy={busyIds.includes(document.id)}
          onRetry={onRetry}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
