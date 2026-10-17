import { useState } from 'react';
import { BadgeCheck, Phone } from 'lucide-react';
import type { WhatsAppNumber, WhatsAppQualityRating } from '@/types/channelTypes';

const QUALITY_STYLES: Record<WhatsAppQualityRating, { label: string; className: string }> = {
  GREEN: { label: 'High quality', className: 'bg-green-500/10 text-green-700' },
  YELLOW: { label: 'Medium quality', className: 'bg-amber-500/10 text-amber-700' },
  RED: { label: 'Low quality', className: 'bg-error/10 text-error' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** A connected WhatsApp number with an inline disconnect confirmation. */
export function ConnectedNumberRow({
  number,
  onDisconnect,
}: {
  number: WhatsAppNumber;
  onDisconnect: (id: number) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const quality = QUALITY_STYLES[number.qualityRating];

  return (
    <li className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-surface border border-outline-variant/30">
      <span className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Phone className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-48">
        <p className="text-sm font-semibold text-on-surface">{number.displayPhoneNumber}</p>
        <p className="flex items-center gap-1 text-xs text-on-surface-variant">
          <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="truncate">{number.verifiedName}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">Connected {formatDate(number.connectedAt)}</span>
        </p>
      </div>

      <span
        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${quality.className}`}
        title="Meta's quality rating for this number, based on recent customer feedback"
      >
        {quality.label}
      </span>

      {confirming ? (
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
