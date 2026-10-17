import { Check } from 'lucide-react';

const STEPS = ['Template', 'Audience', 'Review & send'];

/** 1 Template · 2 Audience · 3 Review & send */
export function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="Broadcast steps">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3 flex-1 last:flex-none min-w-0">
            <span
              aria-current={active ? 'step' : undefined}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                done
                  ? 'bg-primary text-on-primary'
                  : active
                    ? 'bg-primary/10 text-primary ring-2 ring-primary'
                    : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {done ? <Check className="w-4 h-4" /> : step}
            </span>
            <span
              className={`text-sm truncate ${active ? 'font-semibold text-on-surface' : 'text-on-surface-variant'} ${
                active ? '' : 'hidden sm:inline'
              }`}
            >
              {label}
            </span>
            {step < STEPS.length && <span className="flex-1 h-px bg-outline-variant/40 min-w-4" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
