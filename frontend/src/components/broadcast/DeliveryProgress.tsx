import type { DeliveryCounts } from '@/types/broadcastTypes';

const SEGMENTS: { key: keyof DeliveryCounts; label: string; className: string }[] = [
  { key: 'read', label: 'Read', className: 'bg-primary' },
  { key: 'delivered', label: 'Delivered', className: 'bg-primary/60' },
  { key: 'sent', label: 'Sent', className: 'bg-primary/30' },
  { key: 'failed', label: 'Failed', className: 'bg-error' },
];

/** Stacked bar of read / delivered / sent / failed out of the messages queued. */
export function DeliveryProgress({
  delivery,
  queued,
  compact = false,
}: {
  delivery: DeliveryCounts;
  queued: number;
  compact?: boolean;
}) {
  const total = Math.max(queued, 1);
  const done = delivery.sent + delivery.delivered + delivery.read + delivery.failed;

  return (
    <div className="space-y-2">
      <div
        className={`flex w-full overflow-hidden rounded-full bg-surface-container ${compact ? 'h-1.5' : 'h-2.5'}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={queued}
        aria-valuenow={done}
        aria-label={`${done} of ${queued} messages processed`}
      >
        {SEGMENTS.map((s) =>
          delivery[s.key] > 0 ? (
            <span key={s.key} className={s.className} style={{ width: `${(delivery[s.key] / total) * 100}%` }} />
          ) : null
        )}
      </div>

      {compact ? (
        <p className="text-xs text-on-surface-variant">
          {done.toLocaleString()} / {queued.toLocaleString()} processed
          {delivery.failed > 0 && <span className="text-error"> · {delivery.failed.toLocaleString()} failed</span>}
        </p>
      ) : (
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {[{ key: 'pending' as const, label: 'Waiting', className: 'bg-surface-container' }, ...SEGMENTS].map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${s.className}`} aria-hidden="true" />
              <dt className="text-on-surface-variant">{s.label}</dt>
              <dd className="font-semibold text-on-surface">{delivery[s.key].toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
