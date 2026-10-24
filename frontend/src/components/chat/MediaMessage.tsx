import { useState } from 'react';
import { Languages, Loader2, Mic, Play, Video } from 'lucide-react';
import { useAttachmentUrl } from '@/hooks/useAttachmentUrl';
import type { ChatAttachment } from '@/types/chatTypes';

/** Voice note: player, what was said (original language) and the English translation. */
export function VoiceNote({ attachment }: { attachment: ChatAttachment }) {
  const { url, failed } = useAttachmentUrl(attachment);
  const transcript = attachment.transcript;

  return (
    <div className="w-64 max-w-full space-y-2">
      <div className="flex items-center gap-2">
        <Mic className="w-4 h-4 shrink-0 opacity-70" aria-hidden="true" />
        {url ? (
          <audio controls src={url} preload="metadata" className="h-9 w-full" aria-label="Voice note" />
        ) : (
          <span className="text-xs opacity-80">
            {failed ? "Voice note couldn't be downloaded" : attachment.downloadStatus === 'pending' ? 'Downloading voice note…' : 'Loading…'}
          </span>
        )}
      </div>

      {attachment.parsed.status === 'processing' && (
        <p className="flex items-center gap-1.5 text-xs opacity-80">
          <Loader2 className="w-3 h-3 animate-spin" /> Transcribing…
        </p>
      )}
      {transcript?.text && <p className="text-sm whitespace-pre-wrap">{transcript.text}</p>}
      {transcript?.english && (
        <p className="flex items-start gap-1.5 text-xs opacity-80">
          <Languages className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
          <span>
            <span className="font-medium">{transcript.language} → English:</span> {transcript.english}
          </span>
        </p>
      )}
      {attachment.parsed.status === 'parsed' && !transcript?.text && <p className="text-xs opacity-80">No clear speech in this voice note.</p>}
      {attachment.parsed.status === 'failed' && <p className="text-xs opacity-80">Couldn't transcribe this voice note.</p>}
    </div>
  );
}

/** Video: loaded only when the agent presses play (videos can be up to 16 MB). */
export function VideoNote({ attachment }: { attachment: ChatAttachment }) {
  const [requested, setRequested] = useState(false);
  const { url, failed } = useAttachmentUrl(attachment, requested);

  if (attachment.downloadStatus === 'failed' || failed) {
    return (
      <span className="flex items-center gap-2 text-xs opacity-80">
        <Video className="w-4 h-4" /> Video couldn't be downloaded
      </span>
    );
  }

  if (url) {
    return <video controls autoPlay src={url} className="w-72 max-w-full max-h-80 rounded-lg bg-black" aria-label="Video" />;
  }

  return (
    <button
      type="button"
      onClick={() => setRequested(true)}
      disabled={attachment.downloadStatus !== 'done'}
      className="w-64 max-w-full h-36 rounded-lg bg-black/80 text-white flex flex-col items-center justify-center gap-1 disabled:opacity-60 cursor-pointer"
    >
      {requested || attachment.downloadStatus === 'pending' ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-8 h-8" />}
      <span className="text-xs">{attachment.downloadStatus === 'pending' ? 'Downloading video…' : `Play video${attachment.size ? ` · ${attachment.size}` : ''}`}</span>
    </button>
  );
}

/** Sticker: shown on its own, like WhatsApp (no bubble). */
export function StickerImage({ attachment }: { attachment: ChatAttachment }) {
  const { url } = useAttachmentUrl(attachment);
  return url ? (
    <img src={url} alt="Sticker" className="w-32 h-32 object-contain" />
  ) : (
    <span className="inline-flex items-center justify-center w-32 h-32 rounded-xl bg-surface-container text-xs text-on-surface-variant">
      {attachment.downloadStatus === 'failed' ? 'Sticker unavailable' : 'Sticker'}
    </span>
  );
}
