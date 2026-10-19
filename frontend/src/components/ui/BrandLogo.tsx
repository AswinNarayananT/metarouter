import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';

interface BrandLogoProps {
  className?: string;
  showSubtitle?: boolean;
  linkToHome?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function BrandLogo({
  className,
  showSubtitle = false,
  linkToHome = true,
  size = 'md',
}: BrandLogoProps) {
  const iconSizeClasses = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-12 h-12 rounded-2xl',
  };

  const iconSvgSizes = {
    sm: 'size-4',
    md: 'size-5',
    lg: 'size-6',
  };

  const textClasses = {
    sm: 'text-base font-bold',
    md: 'text-lg font-bold',
    lg: 'text-xl font-bold',
  };

  const content = (
    <div className={clsx('flex items-center gap-3 select-none', className)}>
      <div
        className={clsx(
          'flex items-center justify-center bg-primary text-on-primary shadow-sm shrink-0 transition-transform duration-200 group-hover:scale-105',
          iconSizeClasses[size],
        )}
      >
        <MessageSquare className={iconSvgSizes[size]} fill="currentColor" />
      </div>
      <div className="flex flex-col">
        <span
          className={clsx(
            'tracking-tight text-on-surface leading-tight',
            textClasses[size],
          )}
        >
          MetaRouter <span className="text-primary font-bold">AI</span>
        </span>
        {showSubtitle && (
          <span className="text-[11px] font-semibold text-on-surface-variant tracking-wide uppercase">
            WhatsApp Gateway
          </span>
        )}
      </div>
    </div>
  );

  if (linkToHome) {
    return (
      <Link to="/" className="group inline-flex items-center" aria-label="MetaRouter Home">
        {content}
      </Link>
    );
  }

  return content;
}
