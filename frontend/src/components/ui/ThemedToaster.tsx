import { Toaster } from 'sonner';
import { useThemeMode } from '@/hooks/useThemeMode';

// Error / success toasts for the whole app (utils/notify.ts, store/errorToastMiddleware.ts), in the app's light / dark mode
export function ThemedToaster() {
  const [mode] = useThemeMode();
  return <Toaster position="top-right" richColors closeButton theme={mode} />;
}
