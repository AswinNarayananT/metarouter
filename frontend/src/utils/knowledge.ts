export const MAX_KNOWLEDGE_PDF_MB = 10;
export const MAX_KNOWLEDGE_PDF_BYTES = MAX_KNOWLEDGE_PDF_MB * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
