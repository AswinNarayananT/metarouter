import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'google' | 'sso' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary hover:bg-primary-container text-on-primary font-semibold shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98]',
  secondary:
    'bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/50 font-medium transition-colors duration-150',
  google:
    'bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/30 font-medium shadow-xs transition-colors duration-150',
  sso:
    'bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/30 font-medium transition-colors duration-150',
  ghost:
    'bg-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors duration-150',
  outline:
    'bg-transparent text-primary border border-outline-variant hover:bg-surface-container-low transition-colors duration-150 font-medium',
  danger:
    'bg-error hover:bg-error/90 text-on-error font-semibold shadow-sm transition-colors duration-150',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'h-12 px-6 text-sm sm:text-base rounded-lg gap-2.5',
  icon: 'h-9 w-9 rounded-lg p-0',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center transition-all cursor-pointer select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin shrink-0" />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
