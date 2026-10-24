import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Hand, Loader2, Ticket as TicketIcon, UserPlus } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectConversation } from '@/store/chat/chatSlice';
import { selectTicket } from '@/store/tickets/ticketSlice';
import { fetchTicketDetail } from '@/store/tickets/ticketThunks';
import { fetchMoreNotifications, fetchNotifications, markNotificationRead, markNotificationsRead } from '@/store/notifications/notificationThunks';
import type { AppNotification, NotificationTab } from '@/types/notificationTypes';

const TABS: { value: NotificationTab; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'all', label: 'All' },
];

// "just now", "5 min ago", "3 h ago", "Yesterday", "12 Oct"
function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'Yesterday';
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const TYPE_ICONS = {
  handover: { icon: Hand, className: 'bg-amber-500/15 text-amber-700' },
  assigned: { icon: UserPlus, className: 'bg-primary/10 text-primary' },
  ticket_assigned: { icon: TicketIcon, className: 'bg-primary/10 text-primary' },
};

/** Header bell: unread badge and the newest notifications, so a missed pop-up alert is still here later. */
export function NotificationBell() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { items, tab, hasMore, unreadCount, hasLoaded, isLoading, isLoadingMore } = useAppSelector((state) => state.notifications);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);

  // Scrolled to the bottom of the list: load the next older page
  useEffect(() => {
    if (!open || !hasMore || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) dispatch(fetchMoreNotifications());
      },
      { root: listRef.current, rootMargin: '120px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [dispatch, open, hasMore, items.length]);

  const switchTab = (next: NotificationTab) => {
    if (next !== tab) dispatch(fetchNotifications({ tab: next }));
  };

  // Close on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Open the chat it's about, and mark it read
  const openNotification = (notification: AppNotification) => {
    setOpen(false);
    if (!notification.read_at) dispatch(markNotificationRead(notification.id));
    if (notification.ticket) {
      dispatch(selectTicket(notification.ticket.id));
      dispatch(fetchTicketDetail(notification.ticket.id));
      navigate('/dashboard/tickets');
    } else if (notification.conversation_id) {
      dispatch(selectConversation(notification.conversation_id));
      navigate('/dashboard/chats');
    }
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative p-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 rounded-full bg-error text-on-error text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-16 sm:top-full sm:mt-2 sm:w-96 z-50 rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/30">
            <h2 className="text-sm font-semibold text-on-surface">Notifications</h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => dispatch(markNotificationsRead({}))}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all as read
              </button>
            )}
          </div>

          <div role="tablist" aria-label="Notification filter" className="flex gap-1 px-4 py-2 border-b border-outline-variant/30">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => switchTab(t.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  tab === t.value ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {t.label}
                {t.value === 'unread' && unreadCount > 0 && ` (${unreadCount > 99 ? '99+' : unreadCount})`}
              </button>
            ))}
          </div>

          <ul ref={listRef} className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-on-surface-variant">
                {!hasLoaded || isLoading ? 'Loading…' : tab === 'unread' ? "You're all caught up." : 'No notifications yet.'}
              </li>
            )}
            {items.map((notification) => {
              const style = TYPE_ICONS[notification.type] ?? TYPE_ICONS.handover;
              const unread = !notification.read_at;
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-outline-variant/20 transition-colors cursor-pointer ${
                      unread ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-surface-container'
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.className}`}>
                      <style.icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm truncate ${unread ? 'font-semibold text-on-surface' : 'text-on-surface'}`}>
                        {notification.title}
                      </span>
                      {notification.body && <span className="block text-xs text-on-surface-variant truncate">{notification.body}</span>}
                      <span className="block mt-0.5 text-[11px] text-on-surface-variant">{timeAgo(notification.created_at)}</span>
                    </span>
                    {unread && <span className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
            {hasMore && (
              <li ref={sentinelRef} className="flex justify-center py-3 text-on-surface-variant" aria-hidden={!isLoadingMore}>
                {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" aria-label="Loading more" />}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
