import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, LayoutTemplate, Loader2, Paperclip, Send, Smile, X, Zap } from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { QuickReplyPicker } from './QuickReplyPicker';
import { matchQuickReplies } from '@/utils/quickReplies';
import type { QuickReply } from '@/types/quickReplyTypes';

const SLASH_COMMAND = /^\/\S*$/; // "/ref" typed at the start of an otherwise empty box

const MAX_HEIGHT_PX = 160;
// What WhatsApp accepts from us (checked again by the server, with size limits)
const ACCEPTED_FILES = '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reply box: grows with its content, Enter sends, Shift + Enter adds a new line.
 * Emoji picker, quick replies ("/" or the ⚡ button), a file to send (the text becomes its caption),
 * and "Send template" when free text isn't allowed.
 */
export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  disabledReason = null,
  sending = false,
  error = null,
  file = null,
  onFileChange,
  onOpenTemplates,
  quickReplies,
  fillQuickReply,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  disabledReason?: string | null; // Why free text isn't possible right now (shown instead of the hint)
  sending?: boolean;
  error?: string | null;
  file?: File | null;             // Attached file waiting to be sent
  onFileChange?: (file: File | null) => void;
  onOpenTemplates?: () => void;   // Templates work even when free text is locked (24-hour window)
  quickReplies?: QuickReply[];    // Saved replies; inserted into the box, never sent on their own
  fillQuickReply?: (content: string) => string; // Fills {customer_name} etc. for this chat
}) {
  const disabled = Boolean(disabledReason);
  const canSend = !disabled && !sending && (Boolean(value.trim()) || Boolean(file));

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const closeEmoji = useCallback(() => setEmojiOpen(false), []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  // Quick replies: "/ref" at the start of the box, or the ⚡ button (with its own search)
  const [buttonPickerOpen, setButtonPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [dismissedSlash, setDismissedSlash] = useState<string | null>(null); // Escape on "/xyz" keeps it as plain text
  const [activeIndex, setActiveIndex] = useState(0);
  const slashOpen = Boolean(quickReplies) && !disabled && SLASH_COMMAND.test(value) && dismissedSlash !== value;
  const pickerOpen = slashOpen || (buttonPickerOpen && !disabled);
  const matches = useMemo(
    () => (quickReplies ? matchQuickReplies(quickReplies, slashOpen ? value.slice(1) : pickerSearch, !slashOpen) : []),
    [quickReplies, slashOpen, value, pickerSearch]
  );
  const highlighted = Math.min(activeIndex, Math.max(matches.length - 1, 0));

  const closePicker = useCallback(() => {
    setButtonPickerOpen(false);
    setPickerSearch('');
    if (SLASH_COMMAND.test(value)) setDismissedSlash(value);
  }, [value]);

  // Insert at the cursor and keep typing from there
  const insertText = (text: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const pickQuickReply = (reply: QuickReply) => {
    const text = fillQuickReply ? fillQuickReply(reply.content) : reply.content;
    if (slashOpen) {
      // "/ref" is replaced by the reply, ready to edit and send
      const el = textareaRef.current;
      onChange(text);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(text.length, text.length);
      });
    } else {
      insertText(text);
    }
    setButtonPickerOpen(false);
    setPickerSearch('');
    setActiveIndex(0);
  };

  // Arrow keys / Enter / Tab / Escape while the list is open; true when the key was used here
  const handlePickerKey = (e: React.KeyboardEvent): boolean => {
    if (!pickerOpen) return false;
    if (e.key === 'Escape') {
      e.preventDefault();
      closePicker();
      textareaRef.current?.focus();
      return true;
    }
    if (matches.length === 0) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((highlighted + step + matches.length) % matches.length);
      return true;
    }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault();
      pickQuickReply(matches[highlighted]);
      return true;
    }
    return false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handlePickerKey(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  const isImage = file?.type.startsWith('image/');

  return (
    <div className="shrink-0 px-3 sm:px-5 py-3 border-t border-outline-variant/30 bg-surface-container-low">
      {/* Attached file: the text below becomes its caption */}
      {file && (
        <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2 p-2 rounded-xl bg-surface border border-outline-variant/40">
          <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            {isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-medium text-on-surface truncate">{file.name}</span>
            <span className="block text-[11px] text-on-surface-variant">{formatSize(file.size)} · the message below is sent as its caption</span>
          </span>
          <button
            type="button"
            onClick={() => onFileChange?.(null)}
            aria-label="Remove file"
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="max-w-3xl mx-auto flex items-end gap-2">
        <div className="relative flex-1 flex items-end gap-1 bg-surface border border-outline/30 rounded-2xl px-2 focus-within:border-primary transition-colors">
          <button
            type="button"
            onClick={() => setEmojiOpen((o) => !o)}
            disabled={disabled}
            aria-label="Add emoji"
            aria-expanded={emojiOpen}
            className="p-2 my-1 rounded-lg text-on-surface-variant hover:text-on-surface disabled:opacity-40 cursor-pointer"
          >
            <Smile className="w-5 h-5" />
          </button>
          {emojiOpen && <EmojiPicker onPick={insertText} onClose={closeEmoji} />}
          {quickReplies && (
            <button
              type="button"
              onClick={() => setButtonPickerOpen(true)}
              disabled={disabled}
              aria-label="Quick replies"
              aria-expanded={pickerOpen}
              title="Insert a saved reply (or type / in the box)"
              className="p-2 my-1 rounded-lg text-on-surface-variant hover:text-on-surface disabled:opacity-40 cursor-pointer"
            >
              <Zap className="w-5 h-5" />
            </button>
          )}
          {pickerOpen && quickReplies && (
            <QuickReplyPicker
              replies={matches}
              activeIndex={highlighted}
              onActiveIndexChange={setActiveIndex}
              onPick={pickQuickReply}
              onClose={closePicker}
              emptyText={quickReplies.length === 0 ? 'No quick replies yet. Add them in Settings.' : 'No quick reply matches.'}
              search={
                slashOpen
                  ? undefined
                  : {
                      value: pickerSearch,
                      onChange: (text) => {
                        setPickerSearch(text);
                        setActiveIndex(0);
                      },
                      onKeyDown: (e) => {
                        handlePickerKey(e);
                      },
                    }
              }
            />
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? 'Free text is unavailable: send a template instead' : file ? 'Add a caption (optional)' : placeholder}
            disabled={disabled}
            aria-label="Message"
            className="flex-1 resize-none bg-transparent py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
          />
          {onFileChange && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILES}
                className="hidden"
                onChange={(e) => {
                  onFileChange(e.target.files?.[0] ?? null);
                  e.target.value = ''; // Picking the same file again still triggers a change
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                aria-label="Attach file"
                title="Send an image or document"
                className="p-2 my-1 rounded-lg text-on-surface-variant hover:text-on-surface disabled:opacity-40 cursor-pointer"
              >
                <Paperclip className="w-5 h-5" />
              </button>
            </>
          )}
          {onOpenTemplates && (
            <button
              type="button"
              onClick={onOpenTemplates}
              aria-label="Send a template"
              title="Send an approved WhatsApp template (works any time)"
              className="p-2 my-1 rounded-lg text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              <LayoutTemplate className="w-5 h-5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label={file ? 'Send file' : 'Send message'}
          className="h-12 w-12 shrink-0 rounded-2xl bg-primary text-on-primary flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>

      {error || disabledReason ? (
        <div className="max-w-3xl mx-auto mt-1.5 px-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className={`text-[11px] ${error ? 'text-error' : 'text-on-surface-variant'}`}>{error ?? disabledReason}</p>
          {disabled && onOpenTemplates && (
            <button type="button" onClick={onOpenTemplates} className="text-[11px] font-semibold text-primary hover:underline cursor-pointer">
              Send a template
            </button>
          )}
        </div>
      ) : (
        <p className="max-w-3xl mx-auto mt-1.5 px-1 text-[10px] text-on-surface-variant hidden sm:block">
          Enter to send · Shift + Enter for a new line{quickReplies ? ' · / for quick replies' : ''}
        </p>
      )}
    </div>
  );
}
