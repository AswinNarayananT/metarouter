/* Messaging channel types — WhatsAppNumber mirrors the backend `whatsapp_numbers` model */

export type ChannelId = 'whatsapp' | 'instagram' | 'messenger' | 'telegram';

export type WhatsAppQualityRating = 'GREEN' | 'YELLOW' | 'RED';

export interface WhatsAppNumber {
  id: number;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: WhatsAppQualityRating;
  status: 'connected' | 'pending' | 'disconnected';
  connectedAt: string; // ISO date
}
