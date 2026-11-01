import { useSyncExternalStore } from 'react';

// The user can actually see this tab: it's the visible tab and the browser window is in front.
// A chat left open in a background tab or behind another app isn't "being looked at".
function isFocused(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function subscribe(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  window.addEventListener('focus', onChange);
  window.addEventListener('blur', onChange);
  return () => {
    document.removeEventListener('visibilitychange', onChange);
    window.removeEventListener('focus', onChange);
    window.removeEventListener('blur', onChange);
  };
}

export function usePageFocused(): boolean {
  return useSyncExternalStore(subscribe, isFocused, () => true);
}

export { isFocused as isPageFocused };
