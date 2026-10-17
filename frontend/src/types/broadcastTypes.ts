/* Broadcast types — mirror the /api/v1/broadcasts and /api/v1/channels responses */

export interface WhatsAppNumberSummary {
  id: number;
  phone_number_id: string;
  display_phone_number: string;
  quality_rating: string;
  messaging_tier: string;
  status: NumberConnectionStatus;
  disconnected_at: string | null;
  disconnect_message: string | null; // Why it disconnected (from Meta's error subcode)
  created_at: string | null;
}

export type NumberConnectionStatus = 'connected' | 'disconnected';

export interface BroadcastTemplate {
  name: string;
  language: string;
  category: string;
  body_text: string;
  variable_count: number;
  supported: boolean;
  unsupported_reason: string | null;
}

export interface AudienceCounts {
  total_input: number;
  duplicates_removed: number;
  skipped_invalid: number;
  skipped_opted_out: number;
  skipped_recent: number;
  queued_count: number;
}

export type QualityRating = 'GREEN' | 'YELLOW' | 'RED';

export interface BroadcastPreview extends AudienceCounts {
  template: BroadcastTemplate;
  audience_source: AudienceSource;
  sample_message: string;
  quality_rating: QualityRating;
  quality_blocked: boolean;
  quality_warning: string | null;
  messaging_tier: string;
  tier_limit: number | null;
  tier_remaining: number | null;
  send_now_count: number;
  send_later_count: number;
  tier_resume_at: string | null;
}

export type AudienceSource = 'customers' | 'contacts';
export type BroadcastStatus = 'queued' | 'sending' | 'paused' | 'completed' | 'failed';
export type PauseReason = 'quality_low' | 'tier_limit' | 'number_disconnected';
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export type DeliveryCounts = Record<DeliveryStatus, number>;

export interface BroadcastSummary extends AudienceCounts {
  id: number;
  phone_number_id: string;
  template_name: string;
  template_language: string;
  variables: string[] | null;
  use_contact_name: boolean;
  audience_source: AudienceSource;
  status: BroadcastStatus;
  pause_reason: PauseReason | null;
  paused_at: string | null;
  resume_at: string | null;
  not_released_count: number; // Waiting for the tier window or a resume
  error: string | null;
  created_at: string | null;
  delivery: DeliveryCounts;
}

export interface BroadcastRecipient {
  customer_phone: string;
  name: string | null;
  status: DeliveryStatus | 'skipped' | 'queued' | 'pending';
  skip_reason: 'duplicate' | 'invalid' | 'opted_out' | 'recently_messaged' | null;
  error: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface BroadcastDetail extends BroadcastSummary {
  recipients: Paginated<BroadcastRecipient>;
}

export interface BroadcastFormValues {
  phone_number_id: string;
  template_key: string; // `${name}::${language}`
  variables: string[];
  use_contact_name: boolean;
  audience_source: AudienceSource;
  file: File | null;
  consent_confirmed: boolean;
}

export interface BroadcastState {
  numbers: WhatsAppNumberSummary[];
  isLoadingNumbers: boolean;
  numbersError: string | null;

  templates: BroadcastTemplate[];
  isLoadingTemplates: boolean;
  templatesError: string | null;

  preview: BroadcastPreview | null;
  isPreviewing: boolean;
  previewError: string | null;

  isCreating: boolean;
  createError: string | null;

  isResuming: boolean;
  resumeError: string | null;

  list: Paginated<BroadcastSummary> | null;
  isLoadingList: boolean;
  listError: string | null;

  detail: BroadcastDetail | null;
  isLoadingDetail: boolean;
  detailError: string | null;
}
