import React from 'react';
import { Send, CheckCircle2 } from 'lucide-react';

export function Broadcast() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">WhatsApp Broadcast</h1>
        <p className="text-sm text-on-surface-variant">Send approved template campaigns to your isolated customer lists.</p>
      </div>

      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 shadow-xl space-y-6">
        <div>
          <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Select Template</label>
          <select className="w-full px-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary">
            <option>order_confirmation_v1</option>
            <option>promotional_discount_v2</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Target Segment</label>
          <input
            type="text"
            placeholder="All active leads (1,420 contacts)"
            className="w-full px-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
          />
        </div>

        <button className="w-full py-3 bg-primary text-on-primary font-medium rounded-xl hover:bg-primary/90 transition-all shadow-md flex items-center justify-center gap-2">
          <Send className="w-4 h-4" />
          <span>Launch Broadcast Campaign</span>
        </button>
      </div>
    </div>
  );
}