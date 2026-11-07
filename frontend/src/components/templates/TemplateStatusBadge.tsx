import { Ban, CheckCircle2, CircleHelp, Clock, PauseCircle, XCircle } from 'lucide-react';

const STYLES: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  APPROVED: { label: 'Approved', className: 'bg-green-500/10 text-green-700', icon: CheckCircle2 },
  PENDING: { label: 'Pending', className: 'bg-amber-500/10 text-amber-700', icon: Clock },
  REJECTED: { label: 'Rejected', className: 'bg-error/10 text-error', icon: XCircle },
  PAUSED: { label: 'Paused', className: 'bg-amber-500/10 text-amber-700', icon: PauseCircle },
  DISABLED: { label: 'Disabled', className: 'bg-error/10 text-error', icon: Ban },
};

export function TemplateStatusBadge({ status }: { status: string }) {
  // A state Meta adds later still shows, in its own words
  const { label, className, icon: Icon } = STYLES[status] ?? { label: status.replace(/_/g, ' ').toLowerCase(), className: 'bg-surface-container text-on-surface-variant', icon: CircleHelp };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}
