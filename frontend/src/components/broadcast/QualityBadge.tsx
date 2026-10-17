import type { QualityRating } from '@/types/broadcastTypes';

const STYLES: Record<QualityRating, { label: string; className: string; dot: string }> = {
  GREEN: { label: 'High quality', className: 'bg-green-500/10 text-green-700', dot: 'bg-green-600' },
  YELLOW: { label: 'Medium quality', className: 'bg-amber-500/10 text-amber-700', dot: 'bg-amber-500' },
  RED: { label: 'Low quality', className: 'bg-error/10 text-error', dot: 'bg-error' },
};

/** Meta's quality rating for a WhatsApp number. */
export function QualityBadge({ rating }: { rating: string }) {
  const style = STYLES[rating as QualityRating] ?? STYLES.GREEN;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${style.className}`}
      title="Meta's quality rating for this number, based on recent customer feedback"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
    </span>
  );
}
