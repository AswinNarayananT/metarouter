import { useRealtimeStatus } from '@/hooks/useRealtime';
import { clsx } from 'clsx';
import type { RealtimeStatus } from '@/types/realtimeTypes';

const LABELS: Record<RealtimeStatus, string> = {
  idle: 'Offline',
  connecting: 'Connecting…',
  open: 'Live',
  reconnecting: 'Reconnecting…',
};

// Small header pill: whether chat updates are arriving live
export function LiveStatus() {
  const status = useRealtimeStatus();

  return (
    <span
      className="hidden sm:inline-flex items-center gap-1.5 text-xs text-on-surface-variant"
      title={status === 'open' ? 'New messages appear instantly' : 'Live updates paused; retrying automatically'}
    >
      <span
        className={clsx(
          'w-2 h-2 rounded-full',
          status === 'open' && 'bg-green-600',
          (status === 'connecting' || status === 'reconnecting') && 'bg-amber-500 animate-pulse',
          status === 'idle' && 'bg-outline-variant'
        )}
        aria-hidden="true"
      />
      {LABELS[status]}
    </span>
  );
}
