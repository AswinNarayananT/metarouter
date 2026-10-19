import { useEffect, useMemo, useState } from 'react';
import { Camera, MessageCircle, Send } from 'lucide-react';
import type { WhatsAppNumber, WhatsAppQualityRating } from '@/types/channelTypes';
import type { WhatsAppNumberSummary } from '@/types/broadcastTypes';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchWhatsAppNumbers } from '@/store/broadcast/broadcastThunks';
import { ComingSoonChannelCard } from '@/components/channels/ComingSoonChannelCard';
import { WhatsAppChannelCard } from '@/components/channels/WhatsAppChannelCard';

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

const QUALITY_RATINGS: WhatsAppQualityRating[] = ['GREEN', 'YELLOW', 'RED'];

// API row -> what the channel card renders
function toWhatsAppNumber(number: WhatsAppNumberSummary): WhatsAppNumber {
  const quality = number.quality_rating as WhatsAppQualityRating;
  return {
    id: number.id,
    displayPhoneNumber: number.display_phone_number,
    qualityRating: QUALITY_RATINGS.includes(quality) ? quality : 'GREEN',
    messagingTier: number.messaging_tier,
    status: number.status,
    connectedAt: number.created_at,
    disconnectMessage: number.disconnect_message,
  };
}

export function Channels() {
  const dispatch = useAppDispatch();
  // Same list the layout loads for the disconnected-number banner; refreshed when this page opens
  const { numbers: apiNumbers, isLoadingNumbers } = useAppSelector((state) => state.broadcast);
  const numbers = useMemo(() => apiNumbers.map(toWhatsAppNumber), [apiNumbers]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchWhatsAppNumbers());
  }, [dispatch]);

  const handleConnect = () => {
    // TODO: launch Meta Embedded Signup here, then save the number through the API
    setNotice('WhatsApp connection is coming soon. You will be able to connect your number from here.');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Channels</h1>
        <p className="text-sm text-on-surface-variant">
          Connect the messaging apps your customers use. Messages from every channel arrive in Customer Chats.
        </p>
      </div>

      {/* No disconnect action yet: the backend has no endpoint for removing a number */}
      <WhatsAppChannelCard numbers={numbers} isLoading={isLoadingNumbers} notice={notice} onConnect={handleConnect} />

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
