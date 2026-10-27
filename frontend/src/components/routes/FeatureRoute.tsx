import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { Button } from '@/components/ui/Button';

interface FeatureRouteProps {
  feature: string;
  featureTitle?: string;
  children: ReactNode;
}

export function FeatureRoute({ feature, featureTitle, children }: FeatureRouteProps) {
  const isEnabled = useFeatureFlag(feature);

  if (!isEnabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 py-12">
        <div className="size-16 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-4 shadow-sm">
          <ShieldAlert className="size-8" />
        </div>
        <h2 className="text-2xl font-bold text-on-surface">
          {featureTitle || 'Module Not Enabled'}
        </h2>
        <p className="mt-2 text-sm text-on-surface-variant max-w-md">
          The <span className="font-semibold text-on-surface">{feature}</span> module is currently disabled for your company workspace. Contact your administrator or support team to activate it.
        </p>
        <Link to="/dashboard" className="mt-6">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="size-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
