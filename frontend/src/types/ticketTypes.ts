/* Tickets — mirror GET /api/v1/tickets (backend ticket_service.serialize_ticket) */

import type { ApiChatMessage } from './realtimeTypes';

export type TicketType = 'enquiry' | 'problem' | 'complaint';
export type TicketStatus = 'ai_handling' | 'open' | 'in_progress' | 'waiting' | 'closed';
export type TicketCloseReason = 'resolved_by_ai' | 'closed_by_agent' | 'no_reply';

export interface TicketRef {
  id: number;
  name: string;
}

export interface Ticket {
  id: number;
  number: number;
  conversation_id: number;
  customer_name: string | null;
  customer_phone: string | null;
  type: TicketType | null; // null until the AI files it
  group: TicketRef | null;
  subgroup: TicketRef | null;
  subject: string;
  description: string | null;
  status: TicketStatus;
  handled_by: 'ai' | 'human';
  assigned_to: TicketRef | null;
  resolution: string | null;
  close_reason: TicketCloseReason | null;
  closed_at: string | null;
  closed_by: TicketRef | null;
  created_at: string;
  updated_at: string | null;
}

export interface TicketActivity {
  id: number;
  type: string;
  content: string;
  user: TicketRef | null;
  created_at: string;
}

export interface TicketDetail {
  ticket: Ticket;
  activities: TicketActivity[];
  messages: ApiChatMessage[]; // The session's messages
  is_open: boolean;
}

export interface TicketGroupNode {
  id: number;
  name: string;
  ticket_count: number;
  subgroups: { id: number; name: string; ticket_count: number }[];
}

// List tabs: active = the team's work (open, in progress, waiting)
export type TicketTab = 'active' | 'ai_handling' | 'closed' | 'all' | 'mine';

export interface TicketFilters {
  tab: TicketTab;
  type: TicketType | '';
  handledBy: 'ai' | 'human' | '';
  groupId: number | null;
  subgroupId: number | null; // From Insights: "show me these tickets"
  search: string;
}

export interface TicketState {
  items: Ticket[];
  total: number;
  page: number;
  totalPages: number;
  statusCounts: Partial<Record<TicketStatus, number>>;
  filters: TicketFilters;
  isLoading: boolean;
  loadError: string | null;
  groups: TicketGroupNode[];
  selectedId: number | null;
  detail: TicketDetail | null;
  isLoadingDetail: boolean;
  detailError: string | null;
  savingId: number | null;   // Ticket with a change being saved
  actionError: string | null;
  relabelingId: number | null; // Ticket the AI is re-filing in the background
}

/* GET /api/v1/tickets/insights */
export interface TicketInsights {
  days: number;
  totals: {
    tickets: number;
    enquiries: number;
    problems: number;
    complaints: number;
    not_filed: number;
    closed: number;
    closed_by_ai: number;
    team_tickets: number;
    waiting_on_team: number;
    avg_close_hours_ai: number | null;
    avg_close_hours_team: number | null;
  };
  daily: { date: string; count: number }[];
  top_subgroups: { subgroup_id: number; subgroup: string; group: string | null; count: number; complaints: number; closed_by_ai: number }[];
  complaints_by_group: { group_id: number; group: string; count: number }[];
  rising: { subgroup_id: number; subgroup: string; group: string | null; this_week: number; last_week: number }[];
  repeat_customers: { conversation_id: number; customer_name: string | null; customer_phone: string; subgroup: string; count: number }[];
}
