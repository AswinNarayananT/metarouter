import { type HTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

// ─── Card ───────────────────────────────────────────────────────────────────

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** 'default' = clean card | 'feature' = feature grid item | 'form' = elevated auth / central card */
  variant?: 'default' | 'feature' | 'form';
  glow?: boolean;
}

const cardVariants = {
  default:
    'bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xs transition-all duration-200',
  feature:
    'bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xs hover:shadow-md hover:border-primary/40 transition-all duration-200 group',
  form:
    'bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xl shadow-surface-container/60 transition-all duration-300',
};

export function Card({
  variant = 'default',
  glow = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={clsx(
        cardVariants[variant],
        glow && 'shadow-lg shadow-surface-container-highest/80',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── Container ──────────────────────────────────────────────────────────────

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const containerSizes = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-full',
};

export function Container({
  size = 'xl',
  className,
  children,
  ...props
}: ContainerProps) {
  return (
    <div
      className={clsx('mx-auto w-full px-4 sm:px-6 lg:px-8', containerSizes[size], className)}
      {...props}
    >
      {children}
    </div>
  );
}
