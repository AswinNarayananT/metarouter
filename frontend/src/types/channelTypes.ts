/* Messaging channel types — WhatsAppNumber mirrors GET /api/v1/channels/whatsapp/numbers */

export type ChannelId = 'whatsapp' | 'instagram' | 'messenger' | 'telegram';

export type WhatsAppQualityRating = 'GREEN' | 'YELLOW' | 'RED';

export interface WhatsAppNumber {
  id: number;
  displayPhoneNumber: string;
  verifiedName: string | null;     // Business name WhatsApp shows customers
  qualityRating: WhatsAppQualityRating;
  messagingTier: string;           // TIER_250, TIER_1K, TIER_10K, TIER_100K, TIER_UNLIMITED
  status: 'connected' | 'disconnected';
  connectedAt: string | null;      // ISO date
  disconnectMessage: string | null; // Why the token stopped working (disconnected numbers only)
}
