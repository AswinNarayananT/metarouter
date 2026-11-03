// Light / dark mode, chosen per browser in Settings → Appearance. Light is the default;
// only a dark choice is saved, so clearing it (or a fresh browser) falls back to light.
export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme_mode';
const listeners = new Set<() => void>();

// Storage can be blocked (private mode, strict settings): treat that as "no saved choice"
function readSavedMode(): ThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

// The mode on screen right now
export function getThemeMode(): ThemeMode {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

// theme.css reads data-theme on <html>; called once at startup with the saved choice
export function applyThemeMode(mode: ThemeMode = readSavedMode()) {
  document.documentElement.dataset.theme = mode;
}

export function setThemeMode(mode: ThemeMode) {
  try {
    if (mode === 'dark') localStorage.setItem(STORAGE_KEY, 'dark');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not saved, but still applied for this visit
  }
  applyThemeMode(mode);
  listeners.forEach((notify) => notify());
}

export function subscribeThemeMode(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab changed it: follow along
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    applyThemeMode();
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}
