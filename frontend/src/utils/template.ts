import type { MessageTemplate, TemplateCategory, TemplateFormValues } from '@/types/templateTypes';

export const TEMPLATE_NAME_MAX_CHARS = 100;
export const TEMPLATE_BODY_MAX_CHARS = 1024;
export const APP_TEMPLATE_PREFIX = 'metarouter_';

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string; hint: string }[] = [
  { value: 'UTILITY', label: 'Utility', hint: 'Updates about something the customer already did, like an order or booking.' },
  { value: 'MARKETING', label: 'Marketing', hint: 'Offers, announcements and anything that promotes your business.' },
];

export const TEMPLATE_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'kn', label: 'Kannada' },
];

// Meta's rejection codes, in words an admin can act on
const REJECTED_REASONS: Record<string, string> = {
  ABUSIVE_CONTENT: 'Meta found content that breaks its policies.',
  INVALID_FORMAT: 'The format is wrong. Check the variables and the message text.',
  PROMOTIONAL: 'This reads as promotion. Submit it as Marketing, or remove the promotional text.',
  TAG_CONTENT_MISMATCH: "The message doesn't match the chosen category.",
  SCAM: 'Meta flagged this as a possible scam.',
};

export function rejectedReasonText(reason: string | null): string {
  if (!reason || reason === 'NONE') return "Meta didn't give a reason.";
  return REJECTED_REASONS[reason] ?? `Meta's reason: ${reason}`;
}

export function templateKey(template: MessageTemplate): string {
  return `${template.name}::${template.language}`;
}

// "Hi {{1}}, order {{2}}" -> [1, 2]: each variable once, in the order they first appear
export function bodyVariables(body: string): number[] {
  const found = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return [...new Set(found)];
}

export function fillVariables(body: string, examples: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (match, index) => examples[Number(index) - 1] || match);
}

// The same checks as the server, so the admin sees them while typing
export function bodyProblem(body: string): string | null {
  const text = body.trim();
  if (!text) return null;
  const opened = (text.match(/\{\{/g) ?? []).length;
  const closed = (text.match(/\}\}/g) ?? []).length;
  const variables = [...text.matchAll(/\{\{(\d+)\}\}/g)].length;
  if (opened !== variables || closed !== variables) return 'Write variables as {{1}}, {{2}} and so on';
  if (text.startsWith('{{') || text.endsWith('}}')) return "The message can't start or end with a variable";
  if (bodyVariables(text).some((value, index) => value !== index + 1)) return 'Number variables in order: {{1}}, then {{2}}, and so on';
  return null;
}

// A rejected template can't be edited on Meta: it comes back under a new name
export function copyOfTemplate(template: MessageTemplate): TemplateFormValues {
  return {
    name: `${template.name}_2`.slice(0, TEMPLATE_NAME_MAX_CHARS),
    category: template.category === 'MARKETING' ? 'MARKETING' : 'UTILITY',
    language: template.language,
    body: template.body_text,
    examples: bodyVariables(template.body_text).map(() => ''),
  };
}
