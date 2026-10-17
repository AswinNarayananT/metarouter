/** Shared card shell for a messaging channel: icon, name, status pill, body and footer actions. */
export function ChannelCard({
  icon,
  iconClassName,
  name,
  description,
  status,
  children,
  footer,
  muted = false,
}: {
  icon: React.ReactNode;
  iconClassName: string;
  name: string;
  description: string;
  status?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section
      className={`bg-surface-container-low border border-outline-variant/30 rounded-2xl flex flex-col ${
        muted ? 'opacity-70' : 'shadow-xl'
      }`}
      aria-label={name}
    >
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconClassName}`}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-on-surface">{name}</h2>
            {status}
          </div>
          <p className="text-sm text-on-surface-variant mt-0.5">{description}</p>
        </div>
      </div>

      {children && <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-5">{children}</div>}

      {footer && (
        <div className="mt-auto flex flex-wrap items-center justify-end gap-3 px-5 sm:px-6 py-4 border-t border-outline-variant/30">
          {footer}
        </div>
      )}
    </section>
  );
}
