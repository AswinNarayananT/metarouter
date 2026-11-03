import { createContext } from 'react';
import type { Node } from '@xyflow/react';
import { Headset, MessageCircleQuestion, MessageSquareText, ShoppingBag, Sparkles, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FlowBox, FlowBoxType } from '@/types/chatFlowTypes';

export type BoxNodeType = Node<{ box: FlowBox }, 'box'>;

// What every box on the canvas needs to know about the whole menu
export const FlowCanvasContext = createContext<{ startId: string; ordersEnabled: boolean; issueBoxIds: Set<string> }>({
  startId: '',
  ordersEnabled: true,
  issueBoxIds: new Set(),
});

export const BOX_ICONS: Record<FlowBoxType, LucideIcon> = {
  question: MessageCircleQuestion,
  answer: MessageSquareText,
  order: ShoppingBag,
  problem: Wrench,
  team: Headset,
  ai: Sparkles,
};
