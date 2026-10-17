import { FileText, Image as ImageIcon } from 'lucide-react';
import type { ChatAttachment } from '@/types/chatTypes';

export function AttachmentIcon({
  kind,
  className = 'w-5 h-5',
}: {
  kind: ChatAttachment['kind'];
  className?: string;
}) {
  return kind === 'pdf' ? <FileText className={className} /> : <ImageIcon className={className} />;
}
