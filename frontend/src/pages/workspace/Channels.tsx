import { useState } from 'react';
import { Camera, MessageCircle, Send } from 'lucide-react';
import type { WhatsAppNumber } from '@/types/channelTypes';
import { ComingSoonChannelCard } from '@/components/channels/ComingSoonChannelCard';
import { WhatsAppChannelCard } from '@/components/channels/WhatsAppChannelCard';
import { SAMPLE_WHATSAPP_NUMBERS } from './channelsSampleData';

const COMING_SOON = [
  {
    name: 'Instagram',
    description: 'Reply to Instagram direct messages.',
    icon: <Camera className="w-6 h-6" />,
    iconClassName: 'bg-pink-500/10 text-pink-600',
  },
  {
    name: 'Messenger',
    description: 'Chat with customers on Facebook Messenger.',
    icon: <MessageCircle className="w-6 h-6" />,
    iconClassName: 'bg-blue-500/10 text-blue-600',
  },
  {
    name: 'Telegram',
    description: 'Connect a Telegram bot to your inbox.',
    icon: <Send className="w-6 h-6" />,
    iconClassName: 'bg-sky-500/10 text-sky-600',
  },
];

export function Channels() {
  // UI only for now — replace with channels API data once it exists
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>(SAMPLE_WHATSAPP_NUMBERS);
  const [notice, setNotice] = useState<string | null>(null);

  const handleConnect = () => {
    // TODO: launch Meta Embedded Signup here, then save the number through the API
    setNotice('WhatsApp connection is coming soon. You will be able to connect your number from here.');
  };

  const handleDisconnect = (id: number) => {
    // TODO: call the disconnect API; for now this only updates the preview
    setNumbers((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Channels</h1>
        <p className="text-sm text-on-surface-variant">
          Connect the messaging apps your customers use. Messages from every channel arrive in Customer Chats.
        </p>
      </div>

      <WhatsAppChannelCard
        numbers={numbers}
        notice={notice}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-on-surface">More channels</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMING_SOON.map((channel) => (
            <ComingSoonChannelCard key={channel.name} {...channel} />
          ))}
        </div>
      </div>
    </div>
  );
}
