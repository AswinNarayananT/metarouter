import { useEffect, useState } from 'react';

/**
 * Is WhatsApp's 24-hour reply window still open right now?
 * The server's windowOpen is only as fresh as the last load, so this also closes it at windowExpiresAt
 * (the same moment the window badge switches to "Window Closed").
 */
export function useReplyWindowOpen(windowOpen: boolean, windowExpiresAt: string | null): boolean {
  const [now, setNow] = useState(() => Date.now());

  // Re-check when the window ends (or straight away for a chat whose time already passed)
  useEffect(() => {
    if (!windowOpen || !windowExpiresAt) return;
    const msLeft = new Date(windowExpiresAt).getTime() - Date.now();
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, msLeft) + 500);
    return () => window.clearTimeout(timer);
  }, [windowOpen, windowExpiresAt]);

  return windowOpen && Boolean(windowExpiresAt) && new Date(windowExpiresAt as string).getTime() > now;
}
