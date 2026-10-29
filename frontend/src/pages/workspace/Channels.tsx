import { useEffect, useMemo, useState } from 'react';
import { Camera, MessageCircle, Send } from 'lucide-react';
import type { WhatsAppNumber, WhatsAppQualityRating } from '@/types/channelTypes';
import type { WhatsAppNumberSummary } from '@/types/broadcastTypes';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchWhatsAppNumbers } from '@/store/broadcast/broadcastThunks';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import { notifyError, notifySuccess } from '@/utils/notify';
import { runEmbeddedSignup } from '@/utils/metaEmbeddedSignup';
import type { SignupConfig } from '@/utils/metaEmbeddedSignup';
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
    verifiedName: number.verified_name,
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
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'success' | 'error' } | null>(null);
  const [connectLabel, setConnectLabel] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchWhatsAppNumbers());
  }, [dispatch]);

  // Meta's popup gives a one-time code; the backend exchanges it (app secret stays on the server) and saves the number
  const handleConnect = async () => {
    setNotice(null);
    setConnectLabel('Opening Meta…');
    try {
      const { data: config } = await api.get<SignupConfig>('/api/v1/channels/whatsapp/signup-config');
      const result = await runEmbeddedSignup(config);
      setConnectLabel('Finishing setup…');
      const { data: number } = await api.post<WhatsAppNumberSummary>('/api/v1/channels/whatsapp/connect', {
        code: result.code,
        waba_id: result.wabaId,
        phone_number_id: result.phoneNumberId,
        business_id: result.businessId,
      });
      dispatch(fetchWhatsAppNumbers());
      notifySuccess(`${number.display_phone_number} is connected. Customer messages to it now arrive in Customer Chats.`);
    } catch (err) {
      // Popup closed / Meta errors carry their own message; API errors carry the server's
      notifyError(err instanceof Error && !('isAxiosError' in err) ? err.message : getApiErrorMessage(err, "Couldn't connect the number. Please try again."));
    } finally {
      setConnectLabel(null);
    }
  };

  const handleDisconnect = async (id: number) => {
    setNotice(null);
    try {
      const { data } = await api.post<{ number: WhatsAppNumberSummary; warnings: string[] }>(`/api/v1/channels/whatsapp/numbers/${id}/disconnect`);
      dispatch(fetchWhatsAppNumbers());
      setNotice({
        text: `${data.number.display_phone_number} is disconnected. Its chats and tickets are kept.${data.warnings.length ? ' (Meta could not be updated: ' + data.warnings.join('; ') + ')' : ''}`,
        tone: 'info',
      });
    } catch (err) {
      notifyError(err, "Couldn't disconnect the number.");
    }
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
        isLoading={isLoadingNumbers}
        notice={notice?.text ?? null}
        noticeTone={notice?.tone}
        connectLabel={connectLabel}
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
