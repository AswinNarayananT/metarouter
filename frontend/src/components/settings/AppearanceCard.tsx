import { Check, Moon, Palette, Sun } from 'lucide-react';
import { useThemeMode } from '@/hooks/useThemeMode';
import type { ThemeMode } from '@/utils/theme';

const OPTIONS: { mode: ThemeMode; label: string; icon: React.ElementType; preview: { page: string; card: string; line: string } }[] = [
  { mode: 'light', label: 'Light', icon: Sun, preview: { page: 'bg-slate-100', card: 'bg-white', line: 'bg-slate-200' } },
  { mode: 'dark', label: 'Dark', icon: Moon, preview: { page: 'bg-slate-950', card: 'bg-slate-800', line: 'bg-slate-700' } },
];

// Settings → Appearance (workspace and super admin): light / dark, remembered in this browser
export function AppearanceCard() {
  const [mode, setMode] = useThemeMode();

  return (
    <section className="bg-surface-container-lowest border border-border-subtle rounded-card shadow-subtle">
      <div className="flex items-center gap-3 p-6 border-b border-border-subtle">
        <span className="w-9 h-9 rounded-control bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Palette className="w-5 h-5" />
        </span>
        <h2 className="text-base font-semibold text-on-surface">Appearance</h2>
      </div>

      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-4 p-6 max-w-md">
        {OPTIONS.map((option) => {
          const selected = mode === option.mode;
          const Icon = option.icon;
          return (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(option.mode)}
              className={`group text-left rounded-card border-2 p-2 transition-colors cursor-pointer ${
                selected ? 'border-primary' : 'border-border-subtle hover:border-outline-variant'
              }`}
            >
              {/* Mini page preview */}
              <span className={`block h-20 rounded-control p-2 ${option.preview.page}`} aria-hidden="true">
                <span className={`flex h-full flex-col gap-1.5 rounded-md p-2 ${option.preview.card}`}>
                  <span className="h-1.5 w-1/2 rounded-full bg-primary" />
                  <span className={`h-1.5 w-3/4 rounded-full ${option.preview.line}`} />
                  <span className={`h-1.5 w-2/3 rounded-full ${option.preview.line}`} />
                </span>
              </span>
              <span className="flex items-center justify-between gap-2 px-1 pt-2">
                <span className="flex items-center gap-2 text-sm font-medium text-on-surface">
                  <Icon className="w-4 h-4 text-on-surface-variant" />
                  {option.label}
                </span>
                {selected && (
                  <span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
