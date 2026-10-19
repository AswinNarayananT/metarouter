import { BrandLogo } from '@/components/ui/BrandLogo';

export function AuthHeader() {
  return (
    <header className="w-full py-6 px-6 lg:px-12 flex items-center justify-between">
      <BrandLogo size="md" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-on-surface-variant font-medium">Need assistance?</span>
        <a className="text-xs text-primary hover:underline font-semibold" href="#support">
          Contact Support
        </a>
      </div>
    </header>
  );
}