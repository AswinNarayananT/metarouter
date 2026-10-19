import { File, FileText, Image as ImageIcon } from 'lucide-react';
import type { ChatAttachment } from '@/types/chatTypes';

export function AttachmentIcon({
  kind,
  className = 'w-5 h-5',
}: {
  kind: ChatAttachment['kind'];
  className?: string;
}) {
  if (kind === 'pdf') return <FileText className={className} />;
  if (kind === 'file') return <File className={className} />;
  return <ImageIcon className={className} />;
}
