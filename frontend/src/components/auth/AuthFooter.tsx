import { TrustMarkers } from '@/components/TrustMarkers';

export function AuthFooter() {
  return (
    <footer className="w-full py-6 text-center space-y-4">
      <TrustMarkers />
      <p className="text-xs text-on-surface-variant">
        © 2026 MetaRouter AI • Encrypted WhatsApp Business Solution
      </p>
    </footer>
  );
}