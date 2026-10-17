/** WhatsApp-style bubble showing how the message will look to the customer. */
export function MessagePreviewBubble({ text, label = 'Message preview' }: { text: string; label?: string }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-on-surface-variant">{label}</span>
      <div className="rounded-2xl bg-[#e7ddd3] dark:bg-surface-container p-4">
        <div className="max-w-sm rounded-xl rounded-tl-sm bg-white text-gray-900 px-3.5 py-2.5 text-sm leading-relaxed shadow-sm whitespace-pre-wrap wrap-break-word">
          {text || <span className="text-gray-400">Select a template to see the message</span>}
        </div>
      </div>
    </div>
  );
}
