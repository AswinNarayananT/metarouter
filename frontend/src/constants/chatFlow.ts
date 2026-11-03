import type { FlowBoxType } from '@/types/chatFlowTypes';

// WhatsApp's limits, the same as backend/app/services/messaging_service.py
export const QUESTION_TEXT_MAX = 1024;
export const ANSWER_TEXT_MAX = 4096;
export const ACTION_TEXT_MAX = 1024;
export const MAX_OPTIONS = 10;
export const MAX_BUTTONS = 3;
export const BUTTON_TITLE_MAX = 20; // Reply buttons and the list's button
export const OPTION_TITLE_MAX = 24; // List rows
export const OPTION_DESCRIPTION_MAX = 72;
export const MAX_BOXES = 100;
export const DEFAULT_MENU_BUTTON = 'Options';

// What each kind of box does; the defaults are what the customer gets when its text is left empty
export const BOX_TYPES: Record<FlowBoxType, { label: string; description: string; defaultText?: string }> = {
  question: { label: 'Question', description: 'Asks the customer to pick an option.' },
  answer: { label: 'Answer', description: 'Sends a fixed reply, then can ask another question.' },
  order: { label: 'Place an order', description: 'Shows the product list so the customer can order. Hidden while Orders is off.' },
  problem: {
    label: 'Report a problem',
    description: 'Opens a ticket and asks what went wrong. The AI helps, and hands over to your team when needed.',
    defaultText: 'Sorry to hear that. Please tell us what went wrong.',
  },
  team: {
    label: 'Talk to the team',
    description: 'Hands the chat to your team (a ticket opens and they are notified).',
    defaultText: "I'm connecting you with our team. Someone will reply shortly.",
  },
  ai: {
    label: 'AI answers',
    description: 'The AI answers what the customer types next, from your knowledge base.',
    defaultText: 'Sure! What can we help you with?',
  },
};

export const BOX_TYPE_ORDER: FlowBoxType[] = ['question', 'answer', 'order', 'problem', 'team', 'ai'];
