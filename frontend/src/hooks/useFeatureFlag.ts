import { useAppSelector } from '@/store';

/**
 * Checks whether a specific feature module is enabled for the currently logged-in organization.
 * Returns true/false.
 */
export function useFeatureFlag(featureKey: string): boolean {
  return useAppSelector((state) => {
    const features = state.workspace.features || state.workspace.user?.features;
    if (!features) return false;
    return Boolean(features[featureKey]);
  });
}

/**
 * Returns the entire map of active feature keys for the current organization.
 */
export function useFeatureFlags(): Record<string, boolean> {
  return useAppSelector((state) => {
    return state.workspace.features || state.workspace.user?.features || {};
  });
}
