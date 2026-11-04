import { memo, useContext, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Flag, TriangleAlert } from 'lucide-react';
import { BOX_TYPES } from '@/constants/chatFlow';
import type { FlowBoxType } from '@/types/chatFlowTypes';
import { BOX_ICONS, FlowCanvasContext, type BoxNodeType } from './flowCanvas';

// Built-in flows get their own colour so the end of each path is easy to spot
const ACCENTS: Record<FlowBoxType, string> = {
  question: 'bg-primary/10 text-primary',
  answer: 'bg-primary-fixed text-primary-strong',
  order: 'bg-tertiary-container text-on-tertiary-container',
  problem: 'bg-error-container text-on-error-container',
  team: 'bg-secondary-container text-on-secondary-container',
  ai: 'bg-surface-container-high text-on-surface',
};

const handleClass = '!w-3 !h-3 !bg-primary !border-2 !border-surface-container-lowest';

function BoxNodeComponent({ id, data, selected }: NodeProps<BoxNodeType>) {
  const { startId, offBoxTypes, issueBoxIds } = useContext(FlowCanvasContext);
  const { box } = data;

  // Options moved, added or removed: the arrows must start from the new rows
  const updateNodeInternals = useUpdateNodeInternals();
  const optionOrder = box.type === 'question' ? box.options.map((option) => option.id).join() : '';
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, optionOrder, updateNodeInternals]);
  const Icon = BOX_ICONS[box.type];
  const isStart = box.id === startId;
  const hasIssue = issueBoxIds.has(box.id);
  const text = 'text' in box ? (box.text ?? '').trim() : '';

  return (
    <div
      className={`w-64 rounded-xl border bg-surface-container-lowest shadow-sm transition-shadow ${
        selected ? 'border-primary ring-2 ring-primary/30 shadow-md' : hasIssue ? 'border-error' : 'border-outline-variant/70'
      }`}
    >
      {/* Any box can be reached from an option or an answer (the start too: "Back to main menu") */}
      <Handle type="target" position={Position.Left} className={handleClass} />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-outline-variant/40">
        <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${ACCENTS[box.type]}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="text-xs font-semibold text-on-surface truncate">{BOX_TYPES[box.type].label}</span>
        <span className="ml-auto flex items-center gap-1">
          {isStart && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary text-on-primary text-[10px] font-semibold">
              <Flag className="w-2.5 h-2.5" /> Start
            </span>
          )}
          {hasIssue && <TriangleAlert className="w-3.5 h-3.5 text-error" aria-label="Needs fixing" />}
        </span>
      </div>

      <div className="px-3 py-2">
        {box.type === 'order' ? (
          <p className="text-xs text-on-surface-variant">
            {offBoxTypes.includes('order') ? 'Orders is off: customers don’t see options leading here.' : 'Shows the product list.'}
          </p>
        ) : (
          <p className={`text-xs whitespace-pre-line line-clamp-3 ${text ? 'text-on-surface' : 'text-on-surface-variant italic'}`}>
            {text || (box.type === 'question' || box.type === 'answer' ? 'No text yet' : BOX_TYPES[box.type].defaultText)}
          </p>
        )}
      </div>

      {/* A question: one outgoing connector per option */}
      {box.type === 'question' && (
        <ul className="pb-2 space-y-1">
          {box.options.map((option, index) => (
            <li key={option.id} className="relative mx-3 px-2 py-1 rounded-md bg-surface-container text-xs text-on-surface">
              <span className={`block truncate pr-2 ${option.title.trim() ? '' : 'italic text-on-surface-variant'}`}>
                {option.title.trim() || `Option ${index + 1}`}
              </span>
              <Handle
                id={option.id}
                type="source"
                position={Position.Right}
                className={`${handleClass} ${option.next ? '' : '!bg-error'}`}
                style={{ right: -18 }}
              />
            </li>
          ))}
        </ul>
      )}

      {/* An answer can go on to a question */}
      {box.type === 'answer' && (
        <div className="relative px-3 pb-2 text-[11px] text-on-surface-variant text-right">
          Then ask…
          <Handle id="next" type="source" position={Position.Right} className={handleClass} />
        </div>
      )}
    </div>
  );
}

export const BoxNode = memo(BoxNodeComponent);
