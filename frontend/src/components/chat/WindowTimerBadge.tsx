import { useEffect, useState, useMemo } from 'react';
import { Clock, AlertTriangle, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface WindowTimerBadgeProps {
  windowOpen: boolean;
  windowExpiresAt: string | null;
  variant?: 'compact' | 'full';
  className?: string;
  onClick?: () => void;
}

interface WindowStatus {
  state: 'active' | 'expiring_soon' | 'expired';
  label: string;
  subLabel: string;
  title: string;
  hours: number;
  minutes: number;
}

function calculateWindowStatus(windowOpen: boolean, windowExpiresAt: string | null): WindowStatus {
  if (!windowOpen || !windowExpiresAt) {
    return {
      state: 'expired',
      label: 'Window Closed',
      subLabel: 'Template required',
      title: 'WhatsApp 24-hour service window is closed: only approved templates can be sent. Free text works again once the customer replies.',
      hours: 0,
      minutes: 0,
    };
  }

  const expiresTime = new Date(windowExpiresAt).getTime();
  const now = Date.now();
  const diffMs = expiresTime - now;

  if (diffMs <= 0) {
    return {
      state: 'expired',
      label: 'Window Closed',
      subLabel: 'Template required',
      title: 'WhatsApp 24-hour service window has expired: only approved templates can be sent. Free text works again once the customer replies.',
      hours: 0,
      minutes: 0,
    };
  }

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Expiring soon if less than 2 hours (120 minutes) remain
  if (totalMinutes <= 120) {
    const formatted = hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
    return {
      state: 'expiring_soon',
      label: formatted,
      subLabel: 'Expiring soon',
      title: `WhatsApp window expires in ${formatted}. Reply now to avoid requiring a paid template.`,
      hours,
      minutes,
    };
  }

  // Active / Safe
  const formatted = hours > 0 ? `${hours}h left` : `${minutes}m left`;
  return {
    state: 'active',
    label: formatted,
    subLabel: '24h Window',
    title: `WhatsApp 24-hour customer service window is open (${formatted} remaining). Free-form replies permitted.`,
    hours,
    minutes,
  };
}

export function WindowTimerBadge({
  windowOpen,
  windowExpiresAt,
  variant = 'full',
  className = '',
  onClick,
}: WindowTimerBadgeProps) {
  // Re-render every 30 seconds so the countdown moves; the status itself is worked out on each render
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => window.clearInterval(interval);
  }, []);
  const status: WindowStatus = calculateWindowStatus(windowOpen, windowExpiresAt);

  const config = useMemo(() => {
    switch (status.state) {
      case 'active':
        return {
          containerClass:
            'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/15',
          dotClass: 'bg-emerald-500',
          icon: Clock,
          prefix: '24h Window',
        };
      case 'expiring_soon':
        return {
          containerClass:
            'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15 animate-pulse',
          dotClass: 'bg-amber-500',
          icon: AlertTriangle,
          prefix: 'Expiring soon',
        };
      case 'expired':
      default:
        return {
          containerClass:
            'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 hover:bg-rose-500/15',
          dotClass: 'bg-rose-500',
          icon: AlertCircle,
          prefix: 'Window closed',
        };
    }
  }, [status.state]);

  const Icon = config.icon;

  if (variant === 'compact') {
    return (
      <span
        title={status.title}
        className={clsx(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border shrink-0',
          config.containerClass,
          className
        )}
      >
        <span className={clsx('size-1.5 rounded-full shrink-0', config.dotClass)} />
        <span>{status.label}</span>
      </span>
    );
  }

  return (
    <div
      title={status.title}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors select-none',
        config.containerClass,
        onClick && 'cursor-pointer',
        className
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="hidden sm:inline font-semibold opacity-80">{config.prefix}:</span>
      <span>{status.label}</span>
    </div>
  );
}
