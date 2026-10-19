import { Maximize2 } from 'lucide-react';
import type { ChatAttachment } from '@/types/chatTypes';
import { useAttachmentUrl } from '@/hooks/useAttachmentUrl';
import { AttachmentIcon } from './AttachmentIcon';
import { ParsedDetails } from './ParsedDetails';
import { SidePanel } from './SidePanel';

/** Right sidebar for a customer document: preview on top, parsed details below. */
export function DocumentPanel({
  attachment,
  sentAt,
  onClose,
  onViewFull,
}: {
  attachment: ChatAttachment;
  sentAt: string;
  onClose: () => void;
  onViewFull: () => void;
}) {
  const { url } = useAttachmentUrl(attachment, attachment.kind === 'image');

  return (
    <SidePanel title="Document" closeLabel="Close document details" width="w-88" onClose={onClose}>
      {/* Preview — click to open full size */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={onViewFull}
          aria-label={`View ${attachment.fileName} full size`}
          className="group relative w-full h-44 rounded-xl border border-outline-variant/40 overflow-hidden bg-surface-container cursor-zoom-in"
        >
          {attachment.kind === 'image' && url ? (
            <img src={url} alt="" className="w-full h-full object-cover object-top" />
          ) : (
            <span
              className={`w-full h-full flex flex-col items-center justify-center gap-2 ${
                attachment.kind === 'pdf' ? 'bg-error/5 text-error' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              <AttachmentIcon kind={attachment.kind} className="w-12 h-12" />
              <span className="text-xs font-bold uppercase tracking-wider">{attachment.extension}</span>
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 group-focus-visible:bg-black/40 transition-colors">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-xs font-semibold text-gray-900 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              <Maximize2 className="w-3.5 h-3.5" /> View full size
            </span>
          </span>
        </button>
        <div>
          <p className="text-sm font-semibold text-on-surface break-all">{attachment.fileName}</p>
          <p className="text-xs text-on-surface-variant">
            {attachment.size} · Sent at {sentAt}
          </p>
        </div>
      </div>

      <ParsedDetails parsed={attachment.parsed} />
    </SidePanel>
  );
}
