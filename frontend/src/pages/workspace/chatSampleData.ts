import type { ChatConversation } from '@/types/chatTypes';

/* Sample conversations for the chat UI — replace with API data once the chat endpoints exist */

// Renders a simple receipt as an SVG data URI so the image viewer has something real to show
function sampleReceiptImage(): string {
  const rows = [
    ['Wireless Earbuds (Black)', '1', '2,499.00'],
    ['Charging Case Cover', '1', '399.00'],
    ['Express Delivery', '1', '99.00'],
  ];
  const lines = rows
    .map(
      ([d, q, a], i) =>
        `<text x="40" y="${300 + i * 36}" font-size="18">${d}</text>` +
        `<text x="430" y="${300 + i * 36}" font-size="18" text-anchor="end">${q}</text>` +
        `<text x="560" y="${300 + i * 36}" font-size="18" text-anchor="end">${a}</text>`
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="760" viewBox="0 0 600 760" font-family="Arial, sans-serif" fill="#1f2937">
    <rect width="600" height="760" fill="#ffffff"/>
    <rect width="600" height="110" fill="#0f766e"/>
    <text x="40" y="62" font-size="30" font-weight="700" fill="#ffffff">ShopKart Retail</text>
    <text x="40" y="90" font-size="15" fill="#ccfbf1">Tax Invoice · GSTIN 32ABCDE1234F1Z5</text>
    <text x="40" y="160" font-size="16">Invoice no: INV-2026-20419</text>
    <text x="40" y="188" font-size="16">Date: 09 Oct 2026</text>
    <text x="40" y="216" font-size="16">Billed to: Rahul Menon</text>
    <line x1="40" y1="250" x2="560" y2="250" stroke="#d1d5db"/>
    <text x="40" y="272" font-size="14" fill="#6b7280">ITEM</text>
    <text x="430" y="272" font-size="14" fill="#6b7280" text-anchor="end">QTY</text>
    <text x="560" y="272" font-size="14" fill="#6b7280" text-anchor="end">AMOUNT (₹)</text>
    ${lines}
    <line x1="40" y1="420" x2="560" y2="420" stroke="#d1d5db"/>
    <text x="40" y="456" font-size="17">Subtotal</text><text x="560" y="456" font-size="17" text-anchor="end">2,997.00</text>
    <text x="40" y="488" font-size="17">GST (18%)</text><text x="560" y="488" font-size="17" text-anchor="end">539.46</text>
    <text x="40" y="536" font-size="22" font-weight="700">Total</text><text x="560" y="536" font-size="22" font-weight="700" text-anchor="end">₹3,536.46</text>
    <text x="40" y="620" font-size="14" fill="#6b7280">Paid via UPI · Ref 4829 1173 0021</text>
    <text x="300" y="710" font-size="14" fill="#9ca3af" text-anchor="middle">Thank you for shopping with us!</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const SAMPLE_CONVERSATIONS: ChatConversation[] = [
  {
    id: 1,
    name: 'Priya Sharma',
    phone: '+91 98765 43210',
    status: 'active',
    unread: 2,
    lastActive: '10:42 AM',
    messages: [
      { id: 1, sender: 'user', content: 'Hello, I wanted to ask about product availability.', time: '10:38 AM' },
      { id: 2, sender: 'model', content: 'Hi Priya! Happy to help. Which product are you looking for?', time: '10:38 AM', read: true },
      { id: 3, sender: 'user', content: 'The wireless earbuds in black. Are they in stock?', time: '10:41 AM' },
      { id: 4, sender: 'model', content: 'Yes, the black wireless earbuds are in stock and ship within 24 hours.', time: '10:41 AM', read: true },
      { id: 5, sender: 'user', content: 'Great! What is your return policy?', time: '10:42 AM' },
      {
        id: 6,
        sender: 'user',
        content: 'Also attaching my last bill for the warranty.',
        time: '10:42 AM',
        attachment: {
          kind: 'pdf',
          fileName: 'Invoice_Sept_2026.pdf',
          size: '182 KB',
          parsed: { status: 'processing' },
        },
      },
    ],
  },
  {
    id: 2,
    name: 'Rahul Menon',
    phone: '+91 91234 56789',
    status: 'human_takeover',
    unread: 1,
    lastActive: '10:15 AM',
    messages: [
      { id: 1, sender: 'user', content: 'My order arrived damaged. I want a refund right now.', time: '10:12 AM' },
      { id: 2, sender: 'model', content: "I'm sorry about that. I'm connecting you with a support representative who will assist you shortly.", time: '10:12 AM', read: true },
      { id: 3, sender: 'human', content: 'Hi Rahul, this is Anjali from support. Could you share your order number?', time: '10:14 AM', read: true },
      { id: 4, sender: 'user', content: 'Sure, it is #ORD-20419.', time: '10:15 AM' },
      {
        id: 5,
        sender: 'user',
        content: 'Here is the bill.',
        time: '10:15 AM',
        attachment: {
          kind: 'image',
          fileName: 'IMG_20261009_bill.jpg',
          size: '1.2 MB',
          url: sampleReceiptImage(),
          parsed: {
            status: 'parsed',
            documentType: 'Tax invoice',
            confidence: 0.94,
            fields: [
              { label: 'Vendor', value: 'ShopKart Retail' },
              { label: 'GSTIN', value: '32ABCDE1234F1Z5' },
              { label: 'Invoice no.', value: 'INV-2026-20419' },
              { label: 'Invoice date', value: '09 Oct 2026' },
              { label: 'Billed to', value: 'Rahul Menon' },
              { label: 'Payment', value: 'UPI · Ref 4829 1173 0021' },
            ],
            lineItems: [
              { description: 'Wireless Earbuds (Black)', qty: 1, amount: '₹2,499.00' },
              { description: 'Charging Case Cover', qty: 1, amount: '₹399.00' },
              { description: 'Express Delivery', qty: 1, amount: '₹99.00' },
            ],
            totals: [
              { label: 'Subtotal', value: '₹2,997.00' },
              { label: 'GST (18%)', value: '₹539.46' },
              { label: 'Total', value: '₹3,536.46', emphasis: true },
            ],
          },
        },
      },
      {
        id: 6,
        sender: 'user',
        content: 'And the courier receipt.',
        time: '10:16 AM',
        attachment: {
          kind: 'pdf',
          fileName: 'courier_receipt.pdf',
          size: '96 KB',
          parsed: {
            status: 'parsed',
            documentType: 'Delivery receipt',
            confidence: 0.81,
            fields: [
              { label: 'Courier', value: 'BlueDart' },
              { label: 'AWB no.', value: '7741 2290 5531' },
              { label: 'Delivered on', value: '10 Oct 2026, 4:12 PM' },
              { label: 'Package condition', value: 'Outer box damaged' },
            ],
          },
        },
      },
    ],
  },
  {
    id: 3,
    name: 'Fatima Khan',
    phone: '+971 50 123 4567',
    status: 'active',
    unread: 0,
    lastActive: 'Yesterday',
    messages: [
      { id: 1, sender: 'user', content: 'Do you deliver to Dubai?', time: '6:20 PM' },
      { id: 2, sender: 'model', content: 'Yes! We deliver across the UAE. Delivery usually takes 3–5 business days.', time: '6:20 PM', read: true },
      { id: 3, sender: 'user', content: 'Perfect, thank you!', time: '6:22 PM' },
    ],
  },
  {
    id: 4,
    name: 'Arjun Nair',
    phone: '+91 99887 76655',
    status: 'active',
    unread: 0,
    lastActive: 'Mon',
    messages: [
      { id: 1, sender: 'user', content: 'Can I change the delivery address for my order?', time: '2:05 PM' },
      { id: 2, sender: 'model', content: 'You can change the address until the order is shipped. Please share the new address.', time: '2:05 PM', read: true },
    ],
  },
];
