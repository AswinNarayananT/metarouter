import { useEffect, useRef } from 'react';

// Common support-chat emojis, grouped; no package needed for a small picker
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Smileys', emojis: ['😀', '😊', '🙂', '😉', '😄', '😁', '😅', '😂', '🤗', '🤔', '😌', '😇', '🙃', '😔', '😢', '😮'] },
  { label: 'Gestures', emojis: ['👍', '👎', '👌', '🙏', '👏', '🙌', '💪', '👋', '🤝', '✌️', '👉', '☝️'] },
  { label: 'Symbols', emojis: ['✅', '❌', '⚠️', '❗', '❓', '⭐', '🎉', '🔥', '💯', '❤️', '💙', '✨'] },
  { label: 'Work', emojis: ['📄', '📎', '📅', '⏰', '📞', '💬', '📧', '💳', '🧾', '🎓', '💻', '📦'] },
];

/** Small popover grid of emojis; picking one inserts it into the reply. */
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on a click outside or Escape
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Emoji"
      className="absolute bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-2rem)] p-3 rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl z-30 space-y-2"
    >
      {EMOJI_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">{group.label}</p>
          <div className="grid grid-cols-8 gap-0.5">
            {group.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onPick(emoji)}
                aria-label={`Insert ${emoji}`}
                className="h-8 rounded-lg text-lg hover:bg-surface-container cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
