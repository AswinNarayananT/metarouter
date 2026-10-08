import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { clsx } from 'clsx';

interface CopyFieldProps {
  label: string;
  value: string;
  mono?: boolean;
  secret?: boolean;
}

export function CopyField({ label, value, mono, secret }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-outline">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low/70 px-3 py-2.5">
        <p
          className={clsx(
            'flex-1 min-w-0 truncate text-sm font-semibold text-on-surface',
            mono && 'font-mono text-xs',
          )}
        >
          {secret ? '••••••••••••' : value || '—'}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!value}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-surface-container-lowest border border-transparent hover:border-outline-variant/40 transition-colors disabled:opacity-40"
        >
          {copied ? <Check className="size-3.5 text-tertiary" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
