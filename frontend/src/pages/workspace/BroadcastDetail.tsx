import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Clock, Loader2, Play, ShieldAlert, Unplug, Upload, Users } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchBroadcastDetail, resumeBroadcast } from '@/store/broadcast/broadcastThunks';
import { BroadcastStatusBadge } from '@/components/broadcast/BroadcastStatusBadge';
import { DeliveryProgress } from '@/components/broadcast/DeliveryProgress';
import { AudienceSummary } from '@/components/broadcast/AudienceSummary';
import { RecipientsTable } from '@/components/broadcast/RecipientsTable';
import { formatDateTime } from '@/utils/broadcast';

const POLL_INTERVAL_MS = 5000;

export function BroadcastDetail() {
  const dispatch = useAppDispatch();
  const { id } = useParams();
  const broadcastId = Number(id);
  const { detail, isLoadingDetail, detailError, isResuming } = useAppSelector((state) => state.broadcast);
  const [page, setPage] = useState(1);

  // Ignore a detail left over from another broadcast
  const broadcast = detail && detail.id === broadcastId ? detail : null;

  useEffect(() => {
    if (broadcastId) dispatch(fetchBroadcastDetail({ id: broadcastId, page }));
  }, [dispatch, broadcastId, page]);

  // Keep progress live until every message has left the queue (a tier pause continues on its own)
  const inProgress =
    broadcast?.status === 'queued' ||
    broadcast?.status === 'sending' ||
    (broadcast?.status === 'paused' && broadcast.pause_reason === 'tier_limit');
  useEffect(() => {
    if (!inProgress) return;
    const timer = window.setInterval(() => dispatch(fetchBroadcastDetail({ id: broadcastId, page })), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [dispatch, broadcastId, page, inProgress]);

  const handleResume = async () => {
    const result = await dispatch(resumeBroadcast(broadcastId));
    if (resumeBroadcast.fulfilled.match(result)) {
      dispatch(fetchBroadcastDetail({ id: broadcastId, page }));
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link to="/dashboard/broadcast" className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft className="w-4 h-4" /> Broadcasts
      </Link>

      {!broadcast && isLoadingDetail ? (
        <div className="space-y-4" aria-busy="true">
          <div className="h-10 w-72 rounded-lg bg-surface-container animate-pulse" />
          <div className="h-40 rounded-2xl bg-surface-container animate-pulse" />
        </div>
      ) : !broadcast && detailError ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-error/10 text-sm text-error">
          <AlertCircle className="w-4 h-4" /> {detailError}
        </div>
      ) : broadcast ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-on-surface">{broadcast.template_name}</h1>
                <BroadcastStatusBadge status={broadcast.status} />
              </div>
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-on-surface-variant">
                <span>{formatDateTime(broadcast.created_at)}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  {broadcast.audience_source === 'contacts' ? <Upload className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                  {broadcast.audience_source === 'contacts' ? 'Contact list' : 'All customers'}
                </span>
                <span aria-hidden="true">·</span>
                <span>Language: {broadcast.template_language}</span>
              </p>
            </div>
          </div>

          {broadcast.error && (
            <div role="alert" className="flex items-start gap-2 px-4 py-3 rounded-xl bg-error/10 text-sm text-error">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{broadcast.error}</span>
            </div>
          )}

          {/* Paused: why, what happens next, and Resume */}
          {broadcast.status === 'paused' && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-800">
              <span className="flex items-start gap-2 min-w-0">
                {broadcast.pause_reason === 'number_disconnected' ? (
                  <Unplug className="w-4 h-4 shrink-0 mt-0.5" />
                ) : broadcast.pause_reason === 'quality_low' ? (
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                ) : broadcast.pause_reason === 'workspace_inactive' || broadcast.pause_reason === 'workspace_suspended' ? (
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>
                  {broadcast.pause_reason === 'number_disconnected'
                    ? `Paused because this WhatsApp number was disconnected. Reconnect it in Channels, then Resume to send to the customers still waiting.`
                    : broadcast.pause_reason === 'quality_low'
                    ? `Paused because WhatsApp flagged this number for low quality. ${broadcast.not_released_count.toLocaleString()} customers are still waiting. Resume once the quality recovers.`
                    : broadcast.pause_reason === 'workspace_inactive' || broadcast.pause_reason === 'workspace_suspended'
                    ? `Paused because this workspace is inactive. Reactivate the workspace to resume broadcasts.`
                    : `Daily messaging limit reached. ${broadcast.not_released_count.toLocaleString()} customers will get the message automatically${broadcast.resume_at ? ` from ${formatDateTime(broadcast.resume_at)}` : ' when the limit frees up'}.`}
                </span>
              </span>
              <button
                type="button"
                onClick={handleResume}
                disabled={isResuming}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isResuming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Resume
              </button>
            </div>
          )}

          {/* A failed resume shows as a toast */}
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <section className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl p-5 sm:p-6 space-y-4" aria-label="Delivery">
              <h2 className="text-sm font-semibold text-on-surface">Delivery</h2>
              <DeliveryProgress delivery={broadcast.delivery} queued={broadcast.queued_count} />
            </section>
            <section className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl p-5 sm:p-6 space-y-4" aria-label="Audience">
              <h2 className="text-sm font-semibold text-on-surface">Audience</h2>
              <AudienceSummary counts={broadcast} />
            </section>
          </div>

          <section className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl p-5 sm:p-6 space-y-4" aria-label="Recipients">
            <h2 className="text-sm font-semibold text-on-surface">Recipients</h2>
            <RecipientsTable recipients={broadcast.recipients} onPageChange={setPage} loading={isLoadingDetail} />
          </section>
        </>
      ) : null}
    </div>
  );
}
