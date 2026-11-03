import { useSyncExternalStore } from 'react';
import { getThemeMode, setThemeMode, subscribeThemeMode, type ThemeMode } from '@/utils/theme';

// The current light / dark mode and a setter that saves it for this browser
export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const mode = useSyncExternalStore(subscribeThemeMode, getThemeMode, () => 'light' as const);
  return [mode, setThemeMode];
}
