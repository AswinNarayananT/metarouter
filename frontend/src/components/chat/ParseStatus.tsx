import { AlertCircle, Loader2, MinusCircle, Sparkles } from 'lucide-react';
import type { ParsedDocument } from '@/types/chatTypes';

/** One-line parsing state shown on an attachment card. */
export function ParseStatus({ parsed }: { parsed: ParsedDocument }) {
  if (parsed.status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-on-surface-variant">
        <Loader2 className="w-3 h-3 animate-spin" /> Reading document…
      </span>
    );
  }
  if (parsed.status === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-on-surface-variant" title={parsed.note}>
        <MinusCircle className="w-3 h-3" /> Not read automatically
      </span>
    );
  }
  if (parsed.status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-error">
        <AlertCircle className="w-3 h-3" /> Couldn't read details
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
      <Sparkles className="w-3 h-3" />
      {parsed.documentType ?? 'Details extracted'}
    </span>
  );
}
