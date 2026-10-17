import type { BroadcastTemplate } from '@/types/broadcastTypes';
import { renderTemplateBody, templateParameters } from '@/utils/broadcast';
import { MessagePreviewBubble } from './MessagePreviewBubble';

const inputClass =
  'w-full px-4 py-2.5 bg-surface border rounded-xl text-sm text-on-surface focus:outline-none transition-colors';

/** One input per template variable, the "use contact name" toggle and a live preview. */
export function TemplateVariablesFields({
  template,
  variables,
  useContactName,
  errors,
  onVariableChange,
  onVariableBlur,
  onToggleContactName,
}: {
  template: BroadcastTemplate;
  variables: string[];
  useContactName: boolean;
  errors: (string | undefined)[];
  onVariableChange: (index: number, value: string) => void;
  onVariableBlur: (index: number) => void;
  onToggleContactName: (value: boolean) => void;
}) {
  // When the name fills {{1}}, the admin's values start at {{2}}
  const firstEditable = useContactName ? 2 : 1;
  const preview = renderTemplateBody(template.body_text, templateParameters(variables, useContactName));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {template.variable_count > 0 && (
          <label className="flex items-start gap-3 p-3 rounded-xl border border-outline-variant/40 bg-surface cursor-pointer">
            <input
              type="checkbox"
              checked={useContactName}
              onChange={(e) => onToggleContactName(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium text-on-surface">Use each customer's name for {'{{1}}'}</span>
              <span className="block text-xs text-on-surface-variant">
                Taken from the contact list; customers without a name get "Customer".
              </span>
            </span>
          </label>
        )}

        {variables.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            {template.variable_count === 0 ? 'This template has no variables.' : 'No other values needed.'}
          </p>
        ) : (
          variables.map((value, index) => {
            const placeholder = `{{${index + firstEditable}}}`;
            const error = errors[index];
            return (
              <div key={placeholder} className="space-y-1.5">
                <label htmlFor={`variable-${index}`} className="block text-sm font-medium text-on-surface">
                  Value for {placeholder}
                </label>
                <input
                  id={`variable-${index}`}
                  value={value}
                  onChange={(e) => onVariableChange(index, e.target.value)}
                  onBlur={() => onVariableBlur(index)}
                  aria-invalid={!!error}
                  className={`${inputClass} ${error ? 'border-error focus:border-error' : 'border-outline/30 focus:border-primary'}`}
                />
                {error && <p className="text-xs text-error">{error}</p>}
              </div>
            );
          })
        )}
      </div>

      <MessagePreviewBubble text={preview} />
    </div>
  );
}
