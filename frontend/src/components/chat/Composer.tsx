import { useEffect, useRef } from 'react';
import { Paperclip, Send, Smile } from 'lucide-react';

const MAX_HEIGHT_PX = 160;

/** Reply box: grows with its content, Enter sends, Shift + Enter adds a new line. */
export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="shrink-0 px-3 sm:px-5 py-3 border-t border-outline-variant/30 bg-surface-container-low">
      <div className="max-w-3xl mx-auto flex items-end gap-2">
        <div className="flex-1 flex items-end gap-1 bg-surface border border-outline/30 rounded-2xl px-2 focus-within:border-primary transition-colors">
          <button
            type="button"
            aria-label="Add emoji"
            className="p-2 my-1 rounded-lg text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <Smile className="w-5 h-5" />
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label="Message"
            className="flex-1 resize-none bg-transparent py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
          />
          <button
            type="button"
            aria-label="Attach file"
            className="p-2 my-1 rounded-lg text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <Paperclip className="w-5 h-5" />
          </button>
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim()}
          aria-label="Send message"
          className="h-12 w-12 shrink-0 rounded-2xl bg-primary text-on-primary flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
      <p className="max-w-3xl mx-auto mt-1.5 px-1 text-[10px] text-on-surface-variant hidden sm:block">
        Enter to send · Shift + Enter for a new line
      </p>
    </div>
  );
}
