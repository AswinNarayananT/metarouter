import { useMemo, useState } from 'react';
import { Check, FileText, Search } from 'lucide-react';
import type { BroadcastTemplate } from '@/types/broadcastTypes';
import { templateKey } from '@/utils/broadcast';

/** Searchable list of approved templates; unsupported ones are shown but can't be chosen. */
export function TemplatePicker({
  templates,
  value,
  onChange,
  error,
}: {
  templates: BroadcastTemplate[];
  value: string;
  onChange: (key: string) => void;
  error?: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? templates.filter((t) => t.name.toLowerCase().includes(q) || t.body_text.toLowerCase().includes(q))
      : templates;
  }, [templates, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates"
          aria-label="Search templates"
          className="w-full pl-9 pr-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-on-surface-variant">No approved templates match your search.</p>
      ) : (
        <div role="radiogroup" aria-label="Template" className="grid gap-3 sm:grid-cols-2 max-h-[26rem] overflow-y-auto pr-1">
          {filtered.map((template) => {
            const key = templateKey(template);
            const selected = key === value;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!template.supported}
                onClick={() => onChange(key)}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  !template.supported
                    ? 'border-outline-variant/30 bg-surface-container/40 opacity-60 cursor-not-allowed'
                    : selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary cursor-pointer'
                      : 'border-outline-variant/40 bg-surface hover:border-primary/50 cursor-pointer'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-on-surface truncate">{template.name}</span>
                  </span>
                  {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-container text-on-surface-variant uppercase">
                    {template.category}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-container text-on-surface-variant">
                    {template.language}
                  </span>
                  {template.variable_count > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                      {template.variable_count} variable{template.variable_count > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-on-surface-variant line-clamp-3 whitespace-pre-line">{template.body_text}</p>
                {!template.supported && (
                  <p className="mt-2 text-[11px] font-medium text-on-surface-variant">{template.unsupported_reason}</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
