/* Chat menu types — mirror /api/v1/chat-flow (backend/app/schemas/chat_flow_schema.py) */

export type FlowBoxType = 'question' | 'answer' | 'order' | 'problem' | 'team' | 'ai';

export interface FlowPosition {
  x: number;
  y: number;
}

export interface FlowOption {
  id: string;
  title: string;
  description?: string | null; // Only shown when the question goes out as a list
  next: string | null; // The box this option leads to
}

interface FlowBoxBase {
  id: string;
  position: FlowPosition;
}

export interface QuestionBox extends FlowBoxBase {
  type: 'question';
  text: string;
  menu_button?: string | null; // The list's button ("Options" when empty)
  options: FlowOption[];
}

export interface AnswerBox extends FlowBoxBase {
  type: 'answer';
  text: string;
  next?: string | null; // A question to ask after the answer
}

export interface OrderBox extends FlowBoxBase {
  type: 'order';
}

// problem: opens a ticket; team: hands the chat to the team; ai: the AI answers. Empty text = the default message
export interface ActionBox extends FlowBoxBase {
  type: 'problem' | 'team' | 'ai';
  text?: string | null;
}

export type FlowBox = QuestionBox | AnswerBox | OrderBox | ActionBox;

export interface ChatFlowDocument {
  start: string;
  nodes: FlowBox[];
}

export interface ChatFlowResponse {
  flow: ChatFlowDocument;
  is_default: boolean; // No menu saved yet: this is the built-in one
  orders_enabled: boolean;
}

// A problem found before saving, on a box (and one of its options)
export interface FlowIssue {
  boxId: string | null;
  message: string;
}
