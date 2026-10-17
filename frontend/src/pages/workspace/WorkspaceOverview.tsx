import { Users, MessageSquare, Send } from 'lucide-react';
import { useAppSelector } from '@/store';

export function WorkspaceOverview() {
  // Pull user and access token securely from the Redux store state
  const { user} = useAppSelector((state) => state.workspace);

  const stats = [
    { label: 'Active Chats', value: '12', icon: MessageSquare, change: '+4 today' },
    { label: 'Broadcast Reach', value: '1,420', icon: Send, change: '98% delivered' },
    { label: 'Team Agents', value: '4', icon: Users, change: 'Active now' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">
          Welcome back, {user?.name || 'Agent'}!
        </h1>
        <p className="text-sm text-on-surface-variant">
          Here is your workspace activity snapshot for {user?.organization_name || 'your organization'}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  {stat.change}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-on-surface">{stat.value}</h3>
              <p className="text-xs text-on-surface-variant mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}