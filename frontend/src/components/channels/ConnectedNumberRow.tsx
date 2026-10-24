import { useState } from 'react';
import { AlertTriangle, Gauge, Phone } from 'lucide-react';
import type { WhatsAppNumber, WhatsAppQualityRating } from '@/types/channelTypes';

const QUALITY_STYLES: Record<WhatsAppQualityRating, { label: string; className: string }> = {
  GREEN: { label: 'High quality', className: 'bg-green-500/10 text-green-700' },
  YELLOW: { label: 'Medium quality', className: 'bg-amber-500/10 text-amber-700' },
  RED: { label: 'Low quality', className: 'bg-error/10 text-error' },
};

// TIER_250 -> "250", TIER_1K -> "1,000", TIER_UNLIMITED -> "Unlimited"
function tierLabel(tier: string) {
  const value = tier.replace('TIER_', '');
  if (value === 'UNLIMITED') return 'Unlimited customers a day';
  const count = Number(value.replace('K', '')) * (value.endsWith('K') ? 1000 : 1);
  return isNaN(count) ? tier : `Up to ${count.toLocaleString()} customers a day`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** A connected WhatsApp number with an inline disconnect confirmation (when disconnecting is available). */
export function ConnectedNumberRow({
  number,
  onDisconnect,
}: {
  number: WhatsAppNumber;
  onDisconnect?: (id: number) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const quality = QUALITY_STYLES[number.qualityRating];
  const disconnected = number.status === 'disconnected';

  return (
    <li className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-surface border border-outline-variant/30">
      <span className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Phone className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-48">
        <p className="text-sm font-semibold text-on-surface">
          {number.displayPhoneNumber}
          {number.verifiedName && <span className="ml-2 font-normal text-on-surface-variant">· {number.verifiedName}</span>}
        </p>
        {disconnected ? (
          <p className="flex items-start gap-1 text-xs text-error">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{number.disconnectMessage ?? 'The connection to WhatsApp stopped working. Reconnect this number.'}</span>
          </p>
        ) : (
          <p className="flex items-center gap-1 text-xs text-on-surface-variant">
            <Gauge className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate" title="Meta's messaging limit: new customers you can start chats with in 24 hours">
              {tierLabel(number.messagingTier)}
            </span>
            {number.connectedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="shrink-0">Connected {formatDate(number.connectedAt)}</span>
              </>
            )}
          </p>
        )}
      </div>

      {disconnected ? (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-error/10 text-error">Disconnected</span>
      ) : (
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${quality.className}`}
          title="Meta's quality rating for this number, based on recent customer feedback"
        >
          {quality.label}
        </span>
      )}

      {!onDisconnect ? null : confirming ? (
        <div className="flex items-center gap-2" role="group" aria-label="Confirm disconnect">
          <span className="text-xs text-on-surface-variant">Disconnect this number?</span>
          <button
            type="button"
            onClick={() => onDisconnect(number.id)}
            className="px-3 py-1.5 rounded-lg bg-error text-on-error text-xs font-medium hover:bg-error/90 transition-colors cursor-pointer"
          >
            Yes, disconnect
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-medium hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-error hover:bg-error/10 transition-colors cursor-pointer"
        >
          Disconnect
        </button>
      )}
    </li>
  );
}
