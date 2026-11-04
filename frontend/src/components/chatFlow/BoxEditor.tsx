import { ChevronDown, ChevronUp, Flag, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import {
  ACTION_TEXT_MAX,
  ANSWER_TEXT_MAX,
  BOX_TYPES,
  BUTTON_TITLE_MAX,
  DEFAULT_MENU_BUTTON,
  MAX_BUTTONS,
  MAX_OPTIONS,
  OPTION_DESCRIPTION_MAX,
  OPTION_TITLE_MAX,
  QUESTION_TEXT_MAX,
} from '@/constants/chatFlow';
import { addableBoxTypes, boxLabel, charCount, newOption, visibleOptions } from '@/utils/chatFlow';
import type { FlowBox, FlowBoxType, FlowIssue, FlowOption, QuestionBox } from '@/types/chatFlowTypes';
import { BOX_ICONS } from './flowCanvas';
import { WhatsAppPreview } from './WhatsAppPreview';

interface BoxEditorProps {
  box: FlowBox;
  boxes: Map<string, FlowBox>;
  isStart: boolean;
  offBoxTypes: FlowBoxType[];
  orgName: string;
  issues: FlowIssue[];
  onChange: (box: FlowBox) => void;
  onCreateBox: (type: FlowBoxType, from: FlowBox) => string; // Adds a box next to this one, returns its id
  onSetStart: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const inputClass =
  'w-full px-3 py-2 bg-surface border border-outline/30 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary transition-colors';
const NEW_PREFIX = 'new:';

function Counter({ text, max }: { text: string; max: number }) {
  const length = charCount(text.trim());
  return <span className={`text-[11px] shrink-0 ${length > max ? 'text-error' : 'text-on-surface-variant'}`}>{length}/{max}</span>;
}

export function BoxEditor({ box, boxes, isStart, offBoxTypes, orgName, issues, onChange, onCreateBox, onSetStart, onDelete, onClose }: BoxEditorProps) {
  const Icon = BOX_ICONS[box.type];
  const others = [...boxes.values()].filter((other) => other.id !== box.id);

  // A picked "new:<type>" creates that box beside this one and links to it
  const resolveTarget = (value: string): string | null => {
    if (!value) return null;
    return value.startsWith(NEW_PREFIX) ? onCreateBox(value.slice(NEW_PREFIX.length) as FlowBoxType, box) : value;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant/40">
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <h2 className="text-sm font-semibold text-on-surface truncate">{BOX_TYPES[box.type].label}</h2>
        {isStart && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary text-on-primary text-[10px] font-semibold">
            <Flag className="w-2.5 h-2.5" /> Start
          </span>
        )}
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto p-1 rounded-md text-on-surface-variant hover:bg-surface-container cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <p className="text-xs text-on-surface-variant">{BOX_TYPES[box.type].description}</p>

        {issues.length > 0 && (
          <ul role="alert" className="space-y-1 rounded-lg border border-error/30 bg-error-container/30 px-3 py-2">
            {issues.map((issue, index) => (
              <li key={index} className="flex items-start gap-1.5 text-xs text-error">
                <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0" />
                {issue.message}
              </li>
            ))}
          </ul>
        )}

        {box.type === 'question' && <QuestionFields box={box} others={others} boxes={boxes} offBoxTypes={offBoxTypes} onChange={onChange} resolveTarget={resolveTarget} />}

        {box.type === 'answer' && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="box-text" className="block text-sm font-medium text-on-surface">Reply</label>
              <textarea id="box-text" rows={5} value={box.text} onChange={(e) => onChange({ ...box, text: e.target.value })} placeholder="We're open 9am to 9pm, every day." className={`${inputClass} resize-y`} />
              <div className="flex justify-between gap-3">
                <p className="text-[11px] text-on-surface-variant">{'{name}'} and {'{org}'} become the customer's first name and your workspace name.</p>
                <Counter text={box.text} max={ANSWER_TEXT_MAX} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="box-next" className="block text-sm font-medium text-on-surface">Then</label>
              <select id="box-next" value={box.next ?? ''} onChange={(e) => onChange({ ...box, next: resolveTarget(e.target.value) })} className={inputClass}>
                <option value="">Nothing more (the AI answers what they type next)</option>
                {others.filter((other) => other.type === 'question').map((other) => (
                  <option key={other.id} value={other.id}>Ask {boxLabel(other)}</option>
                ))}
                <option value={`${NEW_PREFIX}question`}>Ask a new question</option>
              </select>
            </div>
          </>
        )}

        {(box.type === 'problem' || box.type === 'team' || box.type === 'ai') && (
          <div className="space-y-1.5">
            <label htmlFor="box-text" className="block text-sm font-medium text-on-surface">Message</label>
            <textarea id="box-text" rows={3} value={box.text ?? ''} onChange={(e) => onChange({ ...box, text: e.target.value })} placeholder={BOX_TYPES[box.type].defaultText} className={`${inputClass} resize-y`} />
            <div className="flex justify-between gap-3">
              <p className="text-[11px] text-on-surface-variant">Optional. Leave empty to send the message shown.</p>
              <Counter text={box.text ?? ''} max={ACTION_TEXT_MAX} />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-on-surface">Preview</p>
          <WhatsAppPreview box={box} boxes={boxes} offBoxTypes={offBoxTypes} orgName={orgName} />
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-t border-outline-variant/40">
        {box.type === 'question' && !isStart && (
          <button type="button" onClick={onSetStart} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 cursor-pointer">
            <Flag className="w-3.5 h-3.5" /> Make this the start
          </button>
        )}
        {!isStart && (
          <button type="button" onClick={onDelete} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-error hover:bg-error/10 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" /> Delete box
          </button>
        )}
        {isStart && <p className="text-[11px] text-on-surface-variant">The start question is sent when a customer begins a chat with a greeting.</p>}
      </div>
    </div>
  );
}

interface QuestionFieldsProps {
  box: QuestionBox;
  others: FlowBox[];
  boxes: Map<string, FlowBox>;
  offBoxTypes: FlowBoxType[];
  onChange: (box: FlowBox) => void;
  resolveTarget: (value: string) => string | null;
}

function QuestionFields({ box, others, boxes, offBoxTypes, onChange, resolveTarget }: QuestionFieldsProps) {
  const { asButtons } = visibleOptions(box, boxes, offBoxTypes);
  const showList = box.options.length > MAX_BUTTONS || !asButtons;

  const setOption = (index: number, option: FlowOption) => onChange({ ...box, options: box.options.map((o, i) => (i === index ? option : o)) });
  const moveOption = (index: number, by: number) => {
    const options = [...box.options];
    [options[index], options[index + by]] = [options[index + by], options[index]];
    onChange({ ...box, options });
  };

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="box-text" className="block text-sm font-medium text-on-surface">Question</label>
        <textarea id="box-text" rows={3} value={box.text} onChange={(e) => onChange({ ...box, text: e.target.value })} placeholder="Hi{name}! 👋 Welcome to {org}. How can we help you today?" className={`${inputClass} resize-y`} />
        <div className="flex justify-between gap-3">
          <p className="text-[11px] text-on-surface-variant">{'{name}'} and {'{org}'} become the customer's first name and your workspace name.</p>
          <Counter text={box.text} max={QUESTION_TEXT_MAX} />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-on-surface">Options</legend>
        <p className="text-[11px] text-on-surface-variant">
          Up to {MAX_BUTTONS} options with titles of {BUTTON_TITLE_MAX} characters or less show as buttons; otherwise the customer gets a list (up to {MAX_OPTIONS}).
        </p>
        {box.options.map((option, index) => (
          <div key={option.id} className="space-y-2 rounded-lg border border-outline-variant/50 bg-surface-container-low p-2.5">
            <div className="flex items-center gap-1">
              <input
                aria-label={`Option ${index + 1} title`}
                value={option.title}
                onChange={(e) => setOption(index, { ...option, title: e.target.value })}
                placeholder={`Option ${index + 1}`}
                className={inputClass}
              />
              <Counter text={option.title} max={OPTION_TITLE_MAX} />
            </div>
            {showList && (
              <div className="flex items-center gap-1">
                <input
                  aria-label={`Option ${index + 1} description`}
                  value={option.description ?? ''}
                  onChange={(e) => setOption(index, { ...option, description: e.target.value })}
                  placeholder="Description (optional, shown in the list)"
                  className={inputClass}
                />
                <Counter text={option.description ?? ''} max={OPTION_DESCRIPTION_MAX} />
              </div>
            )}
            <select
              aria-label={`Option ${index + 1} goes to`}
              value={option.next ?? ''}
              onChange={(e) => setOption(index, { ...option, next: resolveTarget(e.target.value) })}
              className={`${inputClass} ${option.next ? '' : 'border-error'}`}
            >
              <option value="">Goes to… (pick a next step)</option>
              {others.filter((other) => !offBoxTypes.includes(other.type) || other.id === option.next).map((other) => (
                <option key={other.id} value={other.id}>{boxLabel(other)}</option>
              ))}
              <optgroup label="Add a new box">
                {addableBoxTypes(offBoxTypes).map((type) => (
                  <option key={type} value={`${NEW_PREFIX}${type}`}>New: {BOX_TYPES[type].label}</option>
                ))}
              </optgroup>
            </select>
            <div className="flex items-center justify-end gap-1">
              <button type="button" disabled={index === 0} onClick={() => moveOption(index, -1)} aria-label="Move up" className="p-1 rounded text-on-surface-variant hover:bg-surface-container disabled:opacity-30 cursor-pointer">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button type="button" disabled={index === box.options.length - 1} onClick={() => moveOption(index, 1)} aria-label="Move down" className="p-1 rounded text-on-surface-variant hover:bg-surface-container disabled:opacity-30 cursor-pointer">
                <ChevronDown className="w-4 h-4" />
              </button>
              <button type="button" disabled={box.options.length === 1} onClick={() => onChange({ ...box, options: box.options.filter((_, i) => i !== index) })} aria-label="Remove option" className="p-1 rounded text-error hover:bg-error/10 disabled:opacity-30 cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {box.options.length < MAX_OPTIONS && (
          <button type="button" onClick={() => onChange({ ...box, options: [...box.options, newOption()] })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Add option
          </button>
        )}
      </fieldset>

      {showList && (
        <div className="space-y-1.5">
          <label htmlFor="box-menu-button" className="block text-sm font-medium text-on-surface">List button</label>
          <div className="flex items-center gap-1">
            <input id="box-menu-button" value={box.menu_button ?? ''} onChange={(e) => onChange({ ...box, menu_button: e.target.value })} placeholder={DEFAULT_MENU_BUTTON} className={inputClass} />
            <Counter text={box.menu_button ?? ''} max={BUTTON_TITLE_MAX} />
          </div>
          <p className="text-[11px] text-on-surface-variant">The button the customer taps to open the list.</p>
        </div>
      )}
    </>
  );
}
