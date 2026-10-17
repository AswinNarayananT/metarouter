import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import type { BroadcastStatus } from '@/types/broadcastTypes';

const STYLES: Record<BroadcastStatus, { label: string; className: string; icon: React.ElementType; spin?: boolean }> = {
  queued: { label: 'Queued', className: 'bg-surface-container text-on-surface-variant', icon: Clock },
  sending: { label: 'Sending', className: 'bg-primary/10 text-primary', icon: Loader2, spin: true },
  completed: { label: 'Completed', className: 'bg-green-500/10 text-green-700', icon: CheckCircle2 },
  failed: { label: 'Failed', className: 'bg-error/10 text-error', icon: XCircle },
};

export function BroadcastStatusBadge({ status }: { status: BroadcastStatus }) {
  const { label, className, icon: Icon, spin } = STYLES[status] ?? STYLES.queued;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}>
      <Icon className={`w-3.5 h-3.5 ${spin ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}
