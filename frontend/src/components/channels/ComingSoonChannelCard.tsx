import { ChannelCard } from './ChannelCard';

/** Greyed-out card for a channel that isn't supported yet. */
export function ComingSoonChannelCard({
  icon,
  iconClassName,
  name,
}: {
  icon: React.ReactNode;
  iconClassName: string;
  name: string;
}) {
  return (
    <ChannelCard
      muted
      icon={icon}
      iconClassName={iconClassName}
      name={name}
      status={
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-surface-container text-on-surface-variant">
          Coming soon
        </span>
      }
    />
  );
}
