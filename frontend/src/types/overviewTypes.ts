/* Workspace overview — mirrors GET /api/v1/overview (backend api/v1/overview.py) */

export type OverviewPeriod = 'today' | '7d' | '30d';

export interface OverviewData {
  period: OverviewPeriod;
  timezone: string;
  generated_at: string;
  cards: {
    conversations: { value: number; previous: number };
    ai_handled: { closed: number; by_ai: number; percent: number | null; previous_percent: number | null };
    waiting_now: number;
    first_response: { avg_seconds: number | null; previous_avg_seconds: number | null; count: number };
  };
  // Escalated chats nobody has taken, waiting longest first
  waiting: { conversation_id: number; customer_name: string | null; customer_phone: string; waiting_since: string | null }[];
  activity: {
    unit: 'hour' | 'day';
    buckets: { start: string; customer: number; ai: number; agent: number }[]; // start = local time, no zone
  };
  team: {
    id: number;
    name: string;
    role: string;
    open_chats: number;
    replies: number;
    tickets_closed: number;
    avg_first_response_seconds: number | null;
  }[];
  tickets: {
    open_by_status: Record<string, number>;
    created: number;
    closed: number;
    top_groups: { id: number; name: string; count: number }[];
  };
  channels: {
    numbers: { id: number; display_phone_number: string; verified_name: string | null; status: string; quality_rating: string; messaging_tier: string }[];
    latest_broadcast: { id: number; template_name: string; status: string; created_at: string; delivery: Record<string, number> } | null;
  };
}
