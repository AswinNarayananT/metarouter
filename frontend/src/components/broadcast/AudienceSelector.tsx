import { useRef } from 'react';
import { Download, FileSpreadsheet, Upload, Users, X } from 'lucide-react';
import type { AudienceSource } from '@/types/broadcastTypes';
import { SAMPLE_CSV } from '@/utils/broadcast';

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadSampleCsv() {
  const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'broadcast-contacts-sample.csv';
  link.click();
  URL.revokeObjectURL(url);
}

const OPTIONS: { value: AudienceSource; title: string; description: string; icon: React.ElementType }[] = [
  {
    value: 'customers',
    title: 'All customers',
    description: 'Everyone who has chatted with your business on WhatsApp.',
    icon: Users,
  },
  {
    value: 'contacts',
    title: 'Upload a contact list',
    description: 'A CSV file with the numbers you want to reach.',
    icon: FileSpreadsheet,
  },
];

/** Choose all customers or a CSV contact list (with consent confirmation). */
export function AudienceSelector({
  source,
  file,
  consentConfirmed,
  errors,
  onSourceChange,
  onFileChange,
  onConsentChange,
}: {
  source: AudienceSource;
  file: File | null;
  consentConfirmed: boolean;
  errors: { file?: string; consent_confirmed?: string };
  onSourceChange: (value: AudienceSource) => void;
  onFileChange: (file: File | null) => void;
  onConsentChange: (value: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const clearFile = () => {
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Audience" className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map(({ value, title, description, icon: Icon }) => {
          const selected = source === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSourceChange(value)}
              className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-outline-variant/40 bg-surface hover:border-primary/50'
              }`}
            >
              <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-on-surface">{title}</span>
                <span className="block text-xs text-on-surface-variant mt-0.5">{description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {source === 'contacts' && (
        <div className="space-y-4">
          {file ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-outline-variant/40 bg-surface">
              <FileSpreadsheet className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-on-surface truncate">{file.name}</p>
                <p className="text-xs text-on-surface-variant">{formatSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={clearFile}
                aria-label="Remove file"
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="broadcast-csv"
              className={`flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl border border-dashed bg-surface hover:bg-surface-container transition-colors cursor-pointer text-center ${
                errors.file ? 'border-error' : 'border-outline/40'
              }`}
            >
              <Upload className="w-5 h-5 text-on-surface-variant" />
              <span className="text-sm text-on-surface">Choose a CSV file</span>
              <span className="text-xs text-on-surface-variant">Max 2 MB · up to 10,000 contacts</span>
            </label>
          )}
          <input
            ref={inputRef}
            id="broadcast-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          {errors.file && <p className="text-xs text-error">{errors.file}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-xl bg-surface-container/60 text-xs text-on-surface-variant">
            <span>
              Needs a <strong className="text-on-surface">phone</strong> column with the country code (e.g. +91 98765 43210) and an optional{' '}
              <strong className="text-on-surface">name</strong> column.
            </span>
            <button
              type="button"
              onClick={downloadSampleCsv}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Sample CSV
            </button>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(e) => onConsentChange(e.target.checked)}
              aria-invalid={!!errors.consent_confirmed}
              className="mt-0.5 accent-primary"
            />
            <span className="text-sm text-on-surface">
              I confirm everyone on this list agreed to receive WhatsApp messages from my business.
            </span>
          </label>
          {errors.consent_confirmed && <p className="text-xs text-error">{errors.consent_confirmed}</p>}
        </div>
      )}
    </div>
  );
}
