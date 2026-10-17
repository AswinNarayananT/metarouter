import type { BroadcastRecipient, BroadcastTemplate } from '@/types/broadcastTypes';

export const DEFAULT_CONTACT_NAME = 'Customer';

export const templateKey = (template: Pick<BroadcastTemplate, 'name' | 'language'>) =>
  `${template.name}::${template.language}`;

/** Replaces {{1}}, {{2}} ... with the given values; unknown placeholders stay visible. */
export function renderTemplateBody(body: string, parameters: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (match, index) => {
    const value = parameters[Number(index) - 1];
    return value && value.trim() ? value : match;
  });
}

/** Values in {{1}}, {{2}} order — {{1}} becomes the contact name when chosen. */
export function templateParameters(variables: string[], useContactName: boolean, name = DEFAULT_CONTACT_NAME): string[] {
  return useContactName ? [name, ...variables] : variables;
}

export const SKIP_REASON_LABELS: Record<NonNullable<BroadcastRecipient['skip_reason']>, string> = {
  duplicate: 'Duplicate number',
  invalid: 'Invalid number',
  opted_out: 'Opted out',
  recently_messaged: 'Messaged in the last 7 days',
};

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const SAMPLE_CSV = 'name,phone\nAsha Menon,+91 98765 43210\nRavi Kumar,+91 98111 22233\n';
