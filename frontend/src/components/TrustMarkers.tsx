import { Verified, Lock, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';

interface TrustMarkersProps {
  className?: string;
  variant?: 'light' | 'subtle';
}

export function TrustMarkers({ className, variant = 'light' }: TrustMarkersProps) {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs',
        variant === 'light' ? 'text-on-surface-variant' : 'text-outline',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <Verified className="size-4 text-primary shrink-0" />
        <span>Official Meta Business Partner</span>
      </div>
      <span className="text-outline-variant select-none">•</span>
      <div className="flex items-center gap-1.5 font-medium">
        <Lock className="size-4 text-primary shrink-0" />
        <span>256-Bit SSL End-to-End</span>
      </div>
      <span className="text-outline-variant select-none">•</span>
      <div className="flex items-center gap-1.5 font-medium">
        <ShieldCheck className="size-4 text-primary shrink-0" />
        <span>GDPR & CCPA Compliant</span>
      </div>
    </div>
  );
}
