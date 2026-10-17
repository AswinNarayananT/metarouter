function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-14 h-14 text-base' : 'w-10 h-10 text-xs';
  return (
    <div
      className={`${dims} rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0`}
    >
      {initials(name)}
    </div>
  );
}
