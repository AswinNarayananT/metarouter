import type { ChatAttachment } from '@/types/chatTypes';
import { useAttachmentUrl } from '@/hooks/useAttachmentUrl';
import { AttachmentIcon } from './AttachmentIcon';
import { ParseStatus } from './ParseStatus';

// Badge colours: PDF red, image primary, other files neutral
const KIND_STYLES: Record<ChatAttachment['kind'], string> = {
  pdf: 'bg-error/10 text-error',
  image: 'bg-primary/10 text-primary',
  file: 'bg-surface-container-high text-on-surface-variant',
};

/** Clickable document card shown inside a message and in the contact panel. */
export function AttachmentCard({
  attachment,
  selected,
  onOpen,
}: {
  attachment: ChatAttachment;
  selected: boolean;
  onOpen: () => void;
}) {
  // Only images show a thumbnail; other files are fetched when opened
  const { url } = useAttachmentUrl(attachment, attachment.kind === 'image');

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${attachment.fileName}`}
      className={`w-64 max-w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-outline-variant/40 bg-surface hover:border-primary/50 hover:bg-surface-container'
      }`}
    >
      {attachment.kind === 'image' && url ? (
        <img
          src={url}
          alt=""
          className="w-12 h-12 rounded-lg object-cover object-top border border-outline-variant/30 shrink-0"
        />
      ) : (
        <span
          className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 ${KIND_STYLES[attachment.kind]}`}
        >
          <AttachmentIcon kind={attachment.kind} />
          <span className="text-[9px] font-bold uppercase mt-0.5">{attachment.extension}</span>
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-on-surface truncate">{attachment.fileName}</span>
        <span className="block text-[11px] text-on-surface-variant">{attachment.size}</span>
        <ParseStatus parsed={attachment.parsed} />
      </span>
    </button>
  );
}
