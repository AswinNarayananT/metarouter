import React from 'react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

interface FeatureGateProps {
  feature: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Conditionally renders children if the current workspace has the feature enabled.
 * If disabled, renders the optional fallback (default: null).
 */
export function FeatureGate({ feature, fallback = null, children }: FeatureGateProps) {
  const isEnabled = useFeatureFlag(feature);
  if (!isEnabled) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
