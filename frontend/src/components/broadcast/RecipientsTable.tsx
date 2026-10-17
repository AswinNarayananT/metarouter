import type { BroadcastRecipient, Paginated } from '@/types/broadcastTypes';
import { SKIP_REASON_LABELS } from '@/utils/broadcast';

const STATUS_STYLES: Record<string, string> = {
  read: 'bg-primary/15 text-primary',
  delivered: 'bg-primary/10 text-primary',
  sent: 'bg-surface-container text-on-surface',
  pending: 'bg-surface-container text-on-surface-variant',
  queued: 'bg-surface-container text-on-surface-variant',
  failed: 'bg-error/10 text-error',
  skipped: 'bg-amber-500/10 text-amber-700',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting',
  queued: 'Waiting',
};

/** Every recipient with their delivery status, or why they were skipped. */
export function RecipientsTable({
  recipients,
  onPageChange,
  loading,
}: {
  recipients: Paginated<BroadcastRecipient>;
  onPageChange: (page: number) => void;
  loading?: boolean;
}) {
  const { items, page, total_pages, total, page_size } = recipients;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
        <table className={`w-full text-sm ${loading ? 'opacity-60' : ''}`}>
          <thead className="bg-surface-container text-on-surface-variant text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Phone</th>
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {items.map((r, index) => (
              <tr key={`${r.customer_phone}-${index}`}>
                <td className="px-4 py-2.5 font-mono text-xs text-on-surface whitespace-nowrap">{r.customer_phone || '—'}</td>
                <td className="px-4 py-2.5 text-on-surface">{r.name || '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[r.status] ?? STATUS_STYLES.pending}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-on-surface-variant">
                  {r.skip_reason ? SKIP_REASON_LABELS[r.skip_reason] : r.error || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total_pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
          <span>
            Showing {(page - 1) * page_size + 1}–{Math.min(page * page_size, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || loading}
              className="px-3 py-1 rounded-lg border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/5 cursor-pointer"
            >
              Previous
            </button>
            <span>
              Page {page} of {total_pages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= total_pages || loading}
              className="px-3 py-1 rounded-lg border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/5 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
