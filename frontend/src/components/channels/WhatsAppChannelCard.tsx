import { Bot, Info, MessageSquare, Plus, Send } from 'lucide-react';
import type { WhatsAppNumber } from '@/types/channelTypes';
import { ChannelCard } from './ChannelCard';
import { ConnectedNumberRow } from './ConnectedNumberRow';
import { WhatsAppIcon } from './WhatsAppIcon';

const BENEFITS = [
  { icon: MessageSquare, text: 'Receive customer messages in Customer Chats' },
  { icon: Bot, text: 'Let your AI assistant reply automatically' },
  { icon: Send, text: 'Send broadcasts with approved templates' },
];

const SIGNUP_STEPS = [
  'Log in with the Facebook account that manages your business',
  'Choose or create your Meta business and WhatsApp Business account',
  'Add your phone number and verify it with a code',
];

/** WhatsApp connection card: setup guide when nothing is connected, number list once connected. */
export function WhatsAppChannelCard({
  numbers,
  isLoading = false,
  notice,
  onConnect,
  onDisconnect,
}: {
  numbers: WhatsAppNumber[];
  isLoading?: boolean;
  notice?: string | null;
  onConnect: () => void;
  onDisconnect?: (id: number) => void;
}) {
  const connected = numbers.length > 0;
  const allDisconnected = connected && numbers.every((n) => n.status === 'disconnected');

  return (
    <ChannelCard
      icon={<WhatsAppIcon className="w-7 h-7" />}
      iconClassName="bg-[#25D366]/15 text-[#128C7E]"
      name="WhatsApp"
      description="Connect your WhatsApp Business number to chat with customers on WhatsApp."
      status={
        isLoading && !connected ? (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container text-on-surface-variant">
            Checking…
          </span>
        ) : allDisconnected ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-error/10 text-error">
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
            Disconnected
          </span>
        ) : connected ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-500/10 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
            Connected
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container text-on-surface-variant">
            Not connected
          </span>
        )
      }
      footer={
        <button
          type="button"
          onClick={onConnect}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium shadow-md hover:bg-primary/90 transition-colors cursor-pointer"
        >
          {connected ? <Plus className="w-4 h-4" /> : <WhatsAppIcon className="w-4 h-4" />}
          {connected ? 'Connect another number' : 'Connect WhatsApp'}
        </button>
      }
    >
      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20 text-sm text-on-surface"
        >
          <Info className="w-4 h-4 text-primary shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {connected ? (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Connected numbers</h3>
          <ul className="space-y-2">
            {numbers.map((n) => (
              <ConnectedNumberRow key={n.id} number={n} onDisconnect={onDisconnect} />
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">What you get</h3>
            <ul className="space-y-2.5">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2.5 text-sm text-on-surface">
                  <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">How it works</h3>
            <ol className="space-y-2.5">
              {SIGNUP_STEPS.map((step, i) => (
                <li key={step} className="flex items-start gap-2.5 text-sm text-on-surface">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-px">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="text-xs text-on-surface-variant">
              This happens in a secure Meta window. It takes about 5 minutes.
            </p>
          </div>
        </div>
      )}
    </ChannelCard>
  );
}
