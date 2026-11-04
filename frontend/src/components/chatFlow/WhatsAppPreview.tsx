import { List } from 'lucide-react';
import { BOX_TYPES, DEFAULT_MENU_BUTTON } from '@/constants/chatFlow';
import { fillPlaceholders, visibleOptions } from '@/utils/chatFlow';
import type { FlowBox, FlowBoxType } from '@/types/chatFlowTypes';

interface WhatsAppPreviewProps {
  box: FlowBox;
  boxes: Map<string, FlowBox>;
  offBoxTypes: FlowBoxType[];
  orgName: string;
}

// Roughly what the customer gets in WhatsApp when they reach this box
export function WhatsAppPreview({ box, boxes, offBoxTypes, orgName }: WhatsAppPreviewProps) {
  const rawText = 'text' in box ? (box.text ?? '').trim() : '';
  const text = fillPlaceholders(rawText || BOX_TYPES[box.type].defaultText || '', orgName);
  const question = box.type === 'question' ? visibleOptions(box, boxes, offBoxTypes) : null;

  if (box.type === 'order') {
    return <p className="text-xs text-on-surface-variant">The customer gets the ordering prompt with a "📋 View products" button.</p>;
  }

  return (
    <div className="rounded-xl bg-chat-bg p-3">
      <div className="max-w-[85%] rounded-lg rounded-tl-none bg-bubble-in shadow-sm">
        <p className={`px-3 py-2 text-sm whitespace-pre-line break-words ${text ? 'text-on-surface' : 'italic text-on-surface-variant'}`}>
          {text || 'Write the text above'}
        </p>
        {question && question.options.length > 0 && question.asButtons && (
          <div className="border-t border-outline-variant/40 divide-y divide-outline-variant/40">
            {question.options.map((option) => (
              <p key={option.id} className="px-3 py-2 text-center text-sm font-medium text-primary truncate">
                {option.title.trim() || '…'}
              </p>
            ))}
          </div>
        )}
        {question && question.options.length > 0 && !question.asButtons && (
          <p className="flex items-center justify-center gap-1.5 border-t border-outline-variant/40 px-3 py-2 text-sm font-medium text-primary">
            <List className="w-4 h-4" />
            {(box.type === 'question' && box.menu_button?.trim()) || DEFAULT_MENU_BUTTON}
          </p>
        )}
      </div>
      {question && question.options.length > 0 && !question.asButtons && (
        <div className="mt-2 max-w-[85%] rounded-lg bg-bubble-in shadow-sm divide-y divide-outline-variant/40">
          {question.options.map((option) => (
            <div key={option.id} className="px-3 py-1.5">
              <p className="text-sm text-on-surface truncate">{option.title.trim() || '…'}</p>
              {option.description?.trim() && <p className="text-xs text-on-surface-variant truncate">{option.description.trim()}</p>}
            </div>
          ))}
        </div>
      )}
      {question && question.options.length === 0 && (
        <p className="mt-2 text-xs text-on-surface-variant">No option can be shown, so only the text is sent.</p>
      )}
    </div>
  );
}
