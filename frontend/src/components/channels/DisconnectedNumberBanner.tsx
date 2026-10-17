import { Link } from 'react-router-dom';
import { Unplug } from 'lucide-react';
import type { WhatsAppNumberSummary } from '@/types/broadcastTypes';

interface DisconnectedNumberBannerProps {
  numbers: WhatsAppNumberSummary[];
  isAdmin: boolean;
}

// Shown to everyone in the workspace while a WhatsApp number's connection is broken
export function DisconnectedNumberBanner({ numbers, isAdmin }: DisconnectedNumberBannerProps) {
  const disconnected = numbers.filter((n) => n.status === 'disconnected');
  if (disconnected.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {disconnected.map((number) => (
        <div
          key={number.phone_number_id}
          role="alert"
          className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-sm text-error"
        >
          <span className="flex items-start gap-2 min-w-0">
            <Unplug className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="space-y-1">
              <span className="block font-semibold">WhatsApp number {number.display_phone_number} is disconnected</span>
              <span className="block">{number.disconnect_message}</span>
              <span className="block">
                Customers don't get AI replies and broadcasts are paused until it is reconnected.
                {!isAdmin && ' Ask a workspace admin to reconnect it.'}
              </span>
            </span>
          </span>
          {isAdmin && (
            <Link
              to="/dashboard/channels"
              className="shrink-0 px-4 py-2 rounded-xl bg-error text-on-error text-sm font-medium hover:bg-error/90 transition-colors"
            >
              Reconnect in Channels
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
