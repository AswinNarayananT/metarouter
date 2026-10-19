import { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import type { ChatAttachment } from '@/types/chatTypes';
import { useAttachmentUrl } from '@/hooks/useAttachmentUrl';
import { AttachmentIcon } from './AttachmentIcon';

/** Full-size document overlay. Closes on the X button, a click outside, or Escape. */
export function DocumentViewer({ attachment, onClose }: { attachment: ChatAttachment; onClose: () => void }) {
  const { url, failed } = useAttachmentUrl(attachment);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.fileName}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
    >
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 text-white">
        <div className="min-w-0 flex items-center gap-2">
          <AttachmentIcon kind={attachment.kind} className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium truncate">{attachment.fileName}</span>
          <span className="text-xs text-white/60 shrink-0">{attachment.size}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close document"
          autoFocus
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Clicks on the document itself don't close the viewer */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8 pt-0 sm:pt-0">
        {url && attachment.kind !== 'file' ? (
          attachment.kind === 'image' ? (
            <img
              src={url}
              alt={attachment.fileName}
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          ) : (
            <iframe
              src={url}
              title={attachment.fileName}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl h-full rounded-lg bg-white shadow-2xl"
            />
          )
        ) : (
          // Other file types can't be previewed safely in the browser: offer a download instead
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col items-center gap-3 p-10 rounded-2xl bg-surface text-center max-w-sm"
          >
            <span className="w-16 h-16 rounded-2xl bg-surface-container text-on-surface-variant flex items-center justify-center">
              <AttachmentIcon kind={attachment.kind} className="w-8 h-8" />
            </span>
            <p className="text-sm font-semibold text-on-surface break-all">{attachment.fileName}</p>
            <p className="text-xs text-on-surface-variant">
              {failed
                ? "This file couldn't be downloaded from WhatsApp."
                : attachment.downloadStatus === 'pending'
                  ? 'Still downloading from WhatsApp…'
                  : attachment.kind === 'file'
                    ? "This file type can't be previewed here."
                    : 'Loading preview…'}
            </p>
            {url && attachment.kind === 'file' && (
              <a
                href={url}
                download={attachment.fileName}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Download className="w-4 h-4" /> Download {attachment.extension}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
