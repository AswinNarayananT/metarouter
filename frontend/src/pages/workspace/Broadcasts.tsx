import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronRight, Megaphone, Plus, Upload, Users } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchBroadcasts } from '@/store/broadcast/broadcastThunks';
import { BroadcastStatusBadge } from '@/components/broadcast/BroadcastStatusBadge';
import { DeliveryProgress } from '@/components/broadcast/DeliveryProgress';
import { formatDateTime } from '@/utils/broadcast';

const POLL_INTERVAL_MS = 5000;

export function Broadcasts() {
  const dispatch = useAppDispatch();
  const { list, isLoadingList, listError } = useAppSelector((state) => state.broadcast);
  const [page, setPage] = useState(1);

  useEffect(() => {
    dispatch(fetchBroadcasts(page));
  }, [dispatch, page]);

  // Keep progress live while any broadcast on this page is still going out
  const inProgress = !!list?.items.some(
    (b) => b.status === 'queued' || b.status === 'sending' || (b.status === 'paused' && b.pause_reason === 'tier_limit')
  );
  useEffect(() => {
    if (!inProgress) return;
    const timer = window.setInterval(() => dispatch(fetchBroadcasts(page)), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [dispatch, page, inProgress]);

  const items = list?.items ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Broadcasts</h1>
          <p className="text-sm text-on-surface-variant">Send approved WhatsApp templates to many customers at once.</p>
        </div>
        <Link
          to="/dashboard/broadcast/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium shadow-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> New broadcast
        </Link>
      </div>

      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl overflow-hidden">
        {isLoadingList && !list ? (
          <div className="p-6 space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : listError && !list ? (
          <div className="p-8 text-center space-y-3">
            <p className="flex items-center justify-center gap-2 text-sm text-error">
              <AlertCircle className="w-4 h-4" /> {listError}
            </p>
            <button type="button" onClick={() => dispatch(fetchBroadcasts(page))} className="text-xs font-medium text-primary hover:underline cursor-pointer">
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 flex flex-col items-center text-center gap-3">
            <span className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Megaphone className="w-7 h-7" />
            </span>
            <h2 className="text-base font-semibold text-on-surface">No broadcasts yet</h2>
            <p className="text-sm text-on-surface-variant max-w-sm">
              Pick an approved template and send it to your customers or an uploaded contact list.
            </p>
            <Link to="/dashboard/broadcast/new" className="text-sm font-medium text-primary hover:underline">
              Create your first broadcast
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/30">
            {items.map((b) => (
              <li key={b.id}>
                <Link to={`/dashboard/broadcast/${b.id}`} className="flex items-center gap-4 p-4 sm:p-5 hover:bg-surface-container/50 transition-colors">
                  <div className="flex-1 min-w-0 grid gap-3 sm:grid-cols-[1fr_14rem] sm:items-center">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-on-surface truncate">{b.template_name}</span>
                        <BroadcastStatusBadge status={b.status} />
                      </div>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
                        <span>{formatDateTime(b.created_at)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          {b.audience_source === 'contacts' ? <Upload className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                          {b.audience_source === 'contacts' ? 'Contact list' : 'All customers'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{b.queued_count.toLocaleString()} recipients</span>
                      </p>
                    </div>
                    <DeliveryProgress delivery={b.delivery} queued={b.queued_count} compact />
                  </div>
                  <ChevronRight className="w-4 h-4 text-on-surface-variant shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {list && list.total_pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-outline-variant/30 text-xs text-on-surface-variant">
            <span>
              Page {list.page} of {list.total_pages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1 || isLoadingList}
                className="px-3 py-1 rounded-lg border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/5 cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= list.total_pages || isLoadingList}
                className="px-3 py-1 rounded-lg border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/5 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
