import {
  ACTION_TEXT_MAX,
  ANSWER_TEXT_MAX,
  BOX_TYPE_ORDER,
  BOX_TYPES,
  BUTTON_TITLE_MAX,
  MAX_BOXES,
  MAX_BUTTONS,
  MAX_OPTIONS,
  OPTION_DESCRIPTION_MAX,
  OPTION_TITLE_MAX,
  QUESTION_TEXT_MAX,
} from '@/constants/chatFlow';
import type { ChatFlowDocument, FlowBox, FlowBoxType, FlowIssue, FlowOption, FlowPosition, QuestionBox } from '@/types/chatFlowTypes';

// Characters as the server counts them (an emoji is one, not two)
export function charCount(text: string): number {
  return [...text].length;
}

// Short random ids (letters and digits): they go into the tap ids WhatsApp sends back
export function newFlowId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function newOption(): FlowOption {
  return { id: newFlowId(), title: '', description: null, next: null };
}

export function newBox(type: FlowBoxType, position: FlowPosition): FlowBox {
  const id = newFlowId();
  if (type === 'question') return { id, type, text: '', menu_button: null, options: [newOption()], position };
  if (type === 'answer') return { id, type, text: '', next: null, position };
  if (type === 'order') return { id, type, position };
  return { id, type, text: null, position };
}

// "Question: How can we help…" (for pickers and messages)
export function boxLabel(box: FlowBox): string {
  const text = 'text' in box ? (box.text ?? '').trim() : '';
  if (box.type === 'question' || box.type === 'answer') {
    return `${BOX_TYPES[box.type].label}: ${text ? (text.length > 40 ? `${text.slice(0, 39)}…` : text) : '(no text yet)'}`;
  }
  return BOX_TYPES[box.type].label;
}

// The boxes an admin can add (none whose module is off)
export function addableBoxTypes(offBoxTypes: FlowBoxType[]): FlowBoxType[] {
  return BOX_TYPE_ORDER.filter((type) => !offBoxTypes.includes(type));
}

// The options the customer sees (a box whose module is off is hidden), and whether they fit as buttons
export function visibleOptions(question: QuestionBox, boxes: Map<string, FlowBox>, offBoxTypes: FlowBoxType[]) {
  const options = question.options.filter((option) => {
    const target = option.next ? boxes.get(option.next) : undefined;
    return target && !offBoxTypes.includes(target.type);
  });
  const asButtons = options.length <= MAX_BUTTONS && options.every((option) => charCount(option.title.trim()) <= BUTTON_TITLE_MAX);
  return { options, asButtons };
}

// The same checks as the server (backend/app/schemas/chat_flow_schema.py), one message per problem
export function validateFlow(flow: ChatFlowDocument): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const boxes = new Map(flow.nodes.map((box) => [box.id, box]));

  if (flow.nodes.length > MAX_BOXES) issues.push({ boxId: null, message: `A menu can have at most ${MAX_BOXES} boxes` });
  if (boxes.get(flow.start)?.type !== 'question') issues.push({ boxId: null, message: 'The menu must start with a question' });

  for (const box of flow.nodes) {
    // "{name}" is empty for a customer without a name: there must be other text
    if ((box.type === 'question' || box.type === 'answer') && box.text.trim() && !box.text.replaceAll('{name}', '').trim()) {
      issues.push({ boxId: box.id, message: 'Add some text besides {name}' });
    }
    if (box.type === 'question') {
      const text = box.text.trim();
      if (!text) issues.push({ boxId: box.id, message: 'A question needs its text' });
      const titles = box.options.map((option) => option.title.trim().toLowerCase()).filter(Boolean);
      if (new Set(titles).size !== titles.length) issues.push({ boxId: box.id, message: 'Two options have the same title' });
      if (text.length > QUESTION_TEXT_MAX) issues.push({ boxId: box.id, message: `Question text must be ${QUESTION_TEXT_MAX} characters or less` });
      if (charCount((box.menu_button ?? '').trim()) > BUTTON_TITLE_MAX) issues.push({ boxId: box.id, message: `The list button must be ${BUTTON_TITLE_MAX} characters or less` });
      if (box.options.length === 0) issues.push({ boxId: box.id, message: 'A question needs at least one option' });
      if (box.options.length > MAX_OPTIONS) issues.push({ boxId: box.id, message: `A question can have at most ${MAX_OPTIONS} options` });
      box.options.forEach((option, index) => {
        const title = option.title.trim();
        const name = title ? `"${title}"` : `Option ${index + 1}`;
        if (!title) issues.push({ boxId: box.id, message: `${name} needs a title` });
        if (charCount(title) > OPTION_TITLE_MAX) issues.push({ boxId: box.id, message: `${name}: titles must be ${OPTION_TITLE_MAX} characters or less` });
        if (charCount((option.description ?? '').trim()) > OPTION_DESCRIPTION_MAX) issues.push({ boxId: box.id, message: `${name}: descriptions must be ${OPTION_DESCRIPTION_MAX} characters or less` });
        if (!option.next || !boxes.has(option.next)) issues.push({ boxId: box.id, message: `${name} has no next step` });
      });
    } else if (box.type === 'answer') {
      const text = box.text.trim();
      if (!text) issues.push({ boxId: box.id, message: 'An answer needs its text' });
      if (text.length > ANSWER_TEXT_MAX) issues.push({ boxId: box.id, message: `Answer text must be ${ANSWER_TEXT_MAX} characters or less` });
      if (box.next && boxes.get(box.next)?.type !== 'question') issues.push({ boxId: box.id, message: 'An answer can only lead on to a question' });
    } else if (box.type !== 'order' && (box.text ?? '').trim().length > ACTION_TEXT_MAX) {
      issues.push({ boxId: box.id, message: `The message must be ${ACTION_TEXT_MAX} characters or less` });
    }
  }
  return issues;
}

// Trimmed, with empty optional texts sent as null (= the default)
export function toSavePayload(flow: ChatFlowDocument): ChatFlowDocument {
  const optional = (value?: string | null) => (value ?? '').trim() || null;
  return {
    start: flow.start,
    nodes: flow.nodes.map((box) => {
      const position = { x: Math.round(box.position.x), y: Math.round(box.position.y) };
      if (box.type === 'question') {
        return {
          ...box,
          position,
          text: box.text.trim(),
          menu_button: optional(box.menu_button),
          options: box.options.map((option) => ({ ...option, title: option.title.trim(), description: optional(option.description) })),
        };
      }
      if (box.type === 'answer') return { ...box, position, text: box.text.trim(), next: box.next || null };
      if (box.type === 'order') return { ...box, position };
      return { ...box, position, text: optional(box.text) };
    }),
  };
}

// {name} and {org} as the customer would see them
export function fillPlaceholders(text: string, orgName: string): string {
  return text.replaceAll('{name}', ' Anu').replaceAll('{org}', orgName).trim();
}
