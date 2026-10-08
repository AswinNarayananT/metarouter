import React from 'react';
import { MessageSquare, Search, Send } from 'lucide-react';

export function CustomerChats() {
  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-8rem)] flex bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden shadow-xl">
      {/* Sidebar list of chats */}
      <div className="w-80 border-r border-outline-variant/30 flex flex-col">
        <div className="p-4 border-b border-outline-variant/30">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-on-surface-variant/60" />
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full pl-9 pr-4 py-2 bg-surface border border-outline/30 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/20">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 hover:bg-surface-container transition-all cursor-pointer">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-semibold text-on-surface">Customer #{i}</h4>
                <span className="text-[10px] text-on-surface-variant">10:42 AM</span>
              </div>
              <p className="text-xs text-on-surface-variant truncate">Hello, inquiring about product availability...</p>
            </div>
          ))}
        </div>
      </div>

      {/* Active Conversation Window */}
      <div className="flex-1 flex flex-col bg-surface">
        <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low">
          <h3 className="text-sm font-semibold text-on-surface">Customer #1</h3>
          <span className="text-xs text-primary font-medium">WhatsApp Connected</span>
        </div>
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          <div className="max-w-xs bg-surface-container p-3 rounded-2xl text-xs text-on-surface">
            Hello, inquiring about product availability...
          </div>
          <div className="max-w-xs ml-auto bg-primary text-on-primary p-3 rounded-2xl text-xs">
            Hi! Yes, all items in your catalog are currently in stock.
          </div>
        </div>
        <div className="p-4 border-t border-outline-variant/30 bg-surface-container-low flex gap-2">
          <input
            type="text"
            placeholder="Type a reply..."
            className="flex-1 px-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary"
          />
          <button className="px-4 py-2.5 bg-primary text-on-primary rounded-xl font-medium text-xs hover:bg-primary/90 transition-all">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}