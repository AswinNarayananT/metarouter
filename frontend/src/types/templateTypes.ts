export type TemplateCategory = 'UTILITY' | 'MARKETING';

// One template per name + language, as Meta holds it now
export interface MessageTemplate {
  name: string;
  language: string;
  category: string;
  status: string; // APPROVED, PENDING, REJECTED, PAUSED, DISABLED, or a newer one from Meta
  rejected_reason: string | null;
  body_text: string;
  variable_count: number;
  supported: boolean; // False: it has a part the app can't send yet (image header, ...)
  unsupported_reason: string | null;
  app_template: boolean; // The app's own order update templates: can't be deleted
}

export interface TemplateFormValues {
  name: string;
  category: TemplateCategory;
  language: string;
  body: string;
  examples: string[]; // One for each variable, shown to Meta's reviewers
}

export interface TemplatesState {
  items: MessageTemplate[];
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  isDeleting: boolean;
}
