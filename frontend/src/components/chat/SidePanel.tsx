import { X } from 'lucide-react';

/**
 * Right-hand sidebar shell: a column on wide screens, a slide-over on smaller ones.
 * Used by the document and contact panels.
 */
export function SidePanel({
  title,
  closeLabel,
  width = 'w-80',
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  width?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside
      className={`fixed inset-y-0 right-0 z-40 ${width} max-w-full xl:static xl:z-auto shrink-0 flex flex-col border-l border-outline-variant/30 bg-surface-container-low shadow-xl xl:shadow-none`}
      aria-label={title}
    >
      <div className="h-16 shrink-0 px-5 flex items-center justify-between border-b border-outline-variant/30">
        <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="p-2 -mr-2 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-6">{children}</div>
    </aside>
  );
}
