/** WhatsApp-style bubble showing how the message will look to the customer. */
export function MessagePreviewBubble({ text, label = 'Message preview' }: { text: string; label?: string }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-on-surface-variant">{label}</span>
      <div className="rounded-card bg-chat-bg p-4">
        <div className="max-w-sm rounded-bubble rounded-tl-none bg-bubble-in text-on-surface px-2.5 py-1.5 text-sm leading-normal shadow-subtle whitespace-pre-wrap wrap-break-word">
          {text || <span className="text-on-surface-variant">Select a template to see the message</span>}
        </div>
      </div>
    </div>
  );
}
