import { useEffect, useState } from 'react';
import { AlertCircle, Clock, LayoutTemplate, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface WindowNoticeBannerProps {
  windowOpen: boolean;
  windowExpiresAt: string | null;
  onOpenTemplates?: () => void;
  disabled?: boolean;
}

export function WindowNoticeBanner({
  windowOpen,
  windowExpiresAt,
  onOpenTemplates,
  disabled = false,
}: WindowNoticeBannerProps) {
  const [diffMinutes, setDiffMinutes] = useState<number | null>(() => {
    if (!windowOpen || !windowExpiresAt) return 0;
    return Math.floor((new Date(windowExpiresAt).getTime() - Date.now()) / (1000 * 60));
  });

  useEffect(() => {
    const update = () => {
      if (!windowOpen || !windowExpiresAt) {
        setDiffMinutes(0);
        return;
      }
      const ms = new Date(windowExpiresAt).getTime() - Date.now();
      setDiffMinutes(Math.floor(ms / (1000 * 60)));
    };

    update();
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, [windowOpen, windowExpiresAt]);

  const isExpired = !windowOpen || (diffMinutes !== null && diffMinutes <= 0);
  const isExpiringSoon = !isExpired && diffMinutes !== null && diffMinutes <= 120;

  if (isExpired) {
    return (
      <div className="mx-3 sm:mx-5 mb-2 p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-surface border border-rose-500/25 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="size-8 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
              <AlertCircle className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-on-surface uppercase tracking-wide">
                  24-Hour WhatsApp Window Closed
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold">
                  Template Required
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">
                More than 24 hours have passed since the customer's last message, so only approved templates can be sent. Free text works again once the customer replies.
              </p>
            </div>
          </div>

          {onOpenTemplates && !disabled && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onOpenTemplates}
              className="shrink-0 gap-1.5 self-start sm:self-center glow-primary"
            >
              <LayoutTemplate className="size-3.5" />
              <span>Choose Template</span>
              <ChevronRight className="size-3.5 opacity-70" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isExpiringSoon && diffMinutes !== null) {
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} minutes`;

    return (
      <div className="mx-3 sm:mx-5 mb-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400 animate-pulse" />
          <span className="truncate">
            <strong className="font-semibold">Window expiring soon:</strong> You have{' '}
            <span className="font-bold underline decoration-amber-500/50">{timeStr}</span> left to send a free-form reply.
          </span>
        </div>
        {onOpenTemplates && (
          <button
            type="button"
            onClick={onOpenTemplates}
            className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 hover:underline shrink-0 cursor-pointer"
          >
            Use template instead
          </button>
        )}
      </div>
    );
  }

  return null;
}
