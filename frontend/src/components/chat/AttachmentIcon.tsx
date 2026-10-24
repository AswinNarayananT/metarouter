import { File, FileText, Image as ImageIcon, Mic, Smile, Video } from 'lucide-react';
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
  if (kind === 'audio') return <Mic className={className} />;
  if (kind === 'video') return <Video className={className} />;
  if (kind === 'sticker') return <Smile className={className} />;
  return <ImageIcon className={className} />;
}
