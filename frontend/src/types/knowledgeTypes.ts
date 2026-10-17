/* Knowledge base types — mirror the /api/v1/ai-settings/knowledge responses */

export type KnowledgeStatus = 'processing' | 'ready' | 'failed';

export interface KnowledgeDocument {
  id: number;
  file_name: string;
  file_size: number | null; // null for uploads made before files were stored
  page_count: number | null;
  status: KnowledgeStatus;
  error: string | null;
  chunk_count: number;
  can_retry: boolean;
  created_at: string | null;
  processed_at: string | null;
}

export interface KnowledgeState {
  documents: KnowledgeDocument[];
  maxDocuments: number | null;
  isLoading: boolean;
  loadError: string | null;

  isUploading: boolean;
  uploadError: string | null;

  // Ids with a retry / delete request in flight
  busyIds: number[];
  actionError: string | null;
}
