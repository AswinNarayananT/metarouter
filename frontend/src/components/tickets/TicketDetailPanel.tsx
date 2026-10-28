import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, CheckCircle2, ExternalLink, Loader2, MessageSquare, Pencil, Sparkles, StickyNote, UserRound, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectConversation } from '@/store/chat/chatSlice';
import { formatPhone } from '@/store/chat/chatMappers';
import { addTicketNote, assignTicket, closeTicket, relabelTicket, updateTicket } from '@/store/tickets/ticketThunks';
import type { TicketChanges } from '@/store/tickets/ticketThunks';
import { fetchTeamMembers } from '@/store/workspace/workspaceThunks';
import type { TicketDetail, TicketType } from '@/types/ticketTypes';
import { TicketHandlerBadge, TicketStatusBadge, TicketTypeBadge } from './TicketBadges';
import { CloseTicketDialog } from './CloseTicketDialog';

const CLOSE_REASONS = {
  resolved_by_ai: 'Closed by the AI after the customer needed nothing else',
  closed_by_agent: 'Closed by a team member',
  no_reply: 'Closed automatically: the customer stopped replying',
};

const fieldClass = 'w-full px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary';
const labelClass = 'text-[11px] font-bold uppercase tracking-wider text-on-surface-variant';

function formatDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}

/** Right-side panel with one ticket: owner, labels, details, resolution, notes, history and the session's messages. */
export function TicketDetailPanel({
  detail,
  isLoading,
  error,
  onClose,
}: {
  detail: TicketDetail | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { groups, savingId, relabelingId } = useAppSelector((state) => state.tickets);
  const currentUser = useAppSelector((state) => state.workspace.user);
  const members = useAppSelector((state) => state.workspace.teamMembers);
  const isSupervisor = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const ticket = detail?.ticket;

  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);

  // Members for the owner picker (admins / managers)
  useEffect(() => {
    if (isSupervisor && members.length === 0) dispatch(fetchTeamMembers());
  }, [dispatch, isSupervisor, members.length]);

  if (!ticket || !detail) {
    return (
      <PanelFrame title="Ticket" onClose={onClose}>
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading ticket…
          </p>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
      </PanelFrame>
    );
  }

  const isOpen = detail.is_open;
  const saving = savingId === ticket.id;
  const isMine = ticket.assigned_to?.id === currentUser?.id;
  const subgroups = groups.find((g) => g.id === ticket.group?.id)?.subgroups ?? [];
  const save = (changes: TicketChanges) => dispatch(updateTicket({ ticketId: ticket.id, changes }));

  const openChat = () => {
    dispatch(selectConversation(ticket.conversation_id));
    navigate('/dashboard/chats');
  };

  const startEditing = () => {
    setSubject(ticket.subject);
    setDescription(ticket.description ?? '');
    setEditing(true);
  };

  const saveText = async () => {
    const result = await dispatch(updateTicket({ ticketId: ticket.id, changes: { subject: subject.trim(), description: description.trim() } }));
    if (updateTicket.fulfilled.match(result)) setEditing(false);
  };

  const submitNote = async () => {
    const result = await dispatch(addTicketNote({ ticketId: ticket.id, content: note.trim() }));
    if (addTicketNote.fulfilled.match(result)) setNote('');
  };

  const confirmClose = async (resolution: string, handBackToAi: boolean) => {
    const result = await dispatch(closeTicket({ ticketId: ticket.id, resolution, handBackToAi }));
    if (closeTicket.fulfilled.match(result)) setClosing(false);
  };

  return (
    <PanelFrame title={`Ticket #${ticket.number}`} onClose={onClose}>
      {/* Summary */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <TicketStatusBadge status={ticket.status} />
          <TicketTypeBadge type={ticket.type} />
          <TicketHandlerBadge ticket={ticket} />
        </div>

        {editing ? (
          <div className="space-y-2">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={255} aria-label="Subject" className={fieldClass} />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} aria-label="Details" className={`${fieldClass} resize-none`} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs text-on-surface hover:bg-surface-container cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveText}
                disabled={saving || !subject.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-medium disabled:opacity-50 cursor-pointer"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
              </button>
            </div>
          </div>
        ) : (
          <div className="group">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-on-surface">{ticket.subject}</h3>
              <button type="button" onClick={startEditing} aria-label="Edit subject and details" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container shrink-0 cursor-pointer">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-on-surface whitespace-pre-wrap">{ticket.description || 'The AI fills this in when the ticket is escalated or closed.'}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-outline-variant/30">
          <div className="min-w-0">
            <p className="text-sm font-medium text-on-surface truncate">{ticket.customer_name || formatPhone(ticket.customer_phone ?? '')}</p>
            {ticket.customer_name && ticket.customer_phone && <p className="text-xs text-on-surface-variant">{formatPhone(ticket.customer_phone)}</p>}
          </div>
          <button
            type="button"
            onClick={openChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 shrink-0 cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Open chat <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </section>

      {/* Owner, status and labels */}
      <section className="grid grid-cols-2 gap-3">
        <label className="col-span-2 space-y-1">
          <span className={labelClass}>Owner (also owns the chat)</span>
          {isOpen && isSupervisor ? (
            <select
              value={ticket.assigned_to?.id ?? ''}
              disabled={saving}
              onChange={(e) => dispatch(assignTicket({ ticketId: ticket.id, userId: e.target.value ? Number(e.target.value) : null }))}
              className={fieldClass}
            >
              <option value="">Unassigned</option>
              {members
                .filter((m) => m.is_active)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === currentUser?.id ? ' (you)' : ''} · {m.role}
                  </option>
                ))}
            </select>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-on-surface">{ticket.assigned_to?.name ?? (ticket.handled_by === 'ai' ? 'AI assistant' : 'Unassigned')}</span>
              {isOpen && (isMine || !ticket.assigned_to) && (
                <button
                  type="button"
                  disabled={saving || !currentUser}
                  onClick={() => dispatch(assignTicket({ ticketId: ticket.id, userId: isMine ? null : currentUser!.id }))}
                  className="px-3 py-1.5 rounded-lg bg-surface-container text-xs font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-50 cursor-pointer"
                >
                  {isMine ? 'Unassign me' : 'Assign to me'}
                </button>
              )}
            </div>
          )}
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Status</span>
          {isOpen && ticket.status !== 'ai_handling' ? (
            <select value={ticket.status} disabled={saving} onChange={(e) => save({ status: e.target.value as TicketChanges['status'] })} className={fieldClass}>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="waiting">Waiting on customer</option>
            </select>
          ) : (
            <TicketStatusBadge status={ticket.status} />
          )}
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Type</span>
          <select value={ticket.type ?? ''} disabled={saving} onChange={(e) => e.target.value && save({ type: e.target.value as TicketType })} className={fieldClass}>
            {!ticket.type && <option value="">Not filed yet</option>}
            <option value="enquiry">Enquiry</option>
            <option value="problem">Problem</option>
            <option value="complaint">Complaint</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Group</span>
          <select value={ticket.group?.id ?? ''} disabled={saving} onChange={(e) => save({ group_id: e.target.value ? Number(e.target.value) : null })} className={fieldClass}>
            <option value="">None</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Subgroup</span>
          <select
            value={ticket.subgroup?.id ?? ''}
            disabled={saving || !ticket.group}
            onChange={(e) => save({ subgroup_id: e.target.value ? Number(e.target.value) : null })}
            className={fieldClass}
          >
            <option value="">None</option>
            {subgroups.map((sg) => (
              <option key={sg.id} value={sg.id}>
                {sg.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {/* Actions */}
      <section className="flex flex-wrap gap-2">
        {isOpen && (
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-on-primary text-xs font-medium hover:bg-primary/90 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" /> Close ticket
          </button>
        )}
        <button
          type="button"
          onClick={() => dispatch(relabelTicket(ticket.id))}
          disabled={relabelingId === ticket.id}
          title="The AI rewrites the subject, details and labels from the latest messages"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container text-on-surface text-xs font-medium hover:bg-surface-container-high disabled:opacity-60 cursor-pointer"
        >
          {relabelingId === ticket.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {relabelingId === ticket.id ? 'AI is refreshing…' : 'Refresh with AI'}
        </button>
      </section>
      {/* Failed saves, notes, relabels and closes show as toasts */}

      {/* Resolution */}
      {(ticket.resolution || ticket.close_reason) && (
        <section className="space-y-1 text-sm">
          <h4 className={labelClass}>Resolution</h4>
          {ticket.resolution && <p className="text-on-surface whitespace-pre-wrap">{ticket.resolution}</p>}
          {ticket.close_reason && (
            <p className="text-xs text-on-surface-variant">
              {CLOSE_REASONS[ticket.close_reason]} · {formatDateTime(ticket.closed_at)}
            </p>
          )}
        </section>
      )}

      {/* Internal note */}
      <section className="space-y-2">
        <h4 className={labelClass}>Internal note</h4>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Only your team sees this"
          className={`${fieldClass} resize-none`}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submitNote}
            disabled={!note.trim() || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface text-xs font-medium hover:bg-surface-container-high disabled:opacity-50 cursor-pointer"
          >
            <StickyNote className="w-3.5 h-3.5" /> Add note
          </button>
        </div>
      </section>

      {/* History (notes highlighted) */}
      <section>
        <h4 className={`${labelClass} mb-2`}>History</h4>
        <ol className="space-y-2 border-l border-outline-variant/40 pl-4">
          {detail.activities.map((activity) => (
            <li key={activity.id} className="relative text-xs">
              <span className={`absolute -left-[1.3rem] top-1 w-2 h-2 rounded-full ${activity.type === 'note' ? 'bg-amber-500' : 'bg-outline-variant'}`} />
              {activity.type === 'note' ? (
                <span className="block p-2 rounded-lg bg-amber-500/10 text-on-surface whitespace-pre-wrap">
                  <span className="font-semibold">{activity.user?.name ?? 'Team'}:</span> {activity.content}
                </span>
              ) : (
                <span className="text-on-surface">{activity.content}</span>
              )}
              <span className="block text-on-surface-variant">{formatDateTime(activity.created_at)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* The session's conversation */}
      <section>
        <h4 className={`${labelClass} mb-2`}>Conversation</h4>
        <div className="space-y-2">
          {detail.messages.length === 0 && <p className="text-xs text-on-surface-variant">No messages.</p>}
          {detail.messages.map((message) =>
            message.sender === 'system' ? (
              <p key={message.id} className="text-center text-[11px] text-on-surface-variant">
                {message.content}
              </p>
            ) : (
              <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap ${
                    message.sender === 'user' ? 'bg-surface border border-outline-variant/30 text-on-surface' : message.sender === 'model' ? 'bg-primary/10 text-on-surface' : 'bg-surface-container-high text-on-surface'
                  }`}
                >
                  {message.sender !== 'user' && (
                    <span className="flex items-center gap-1 mb-0.5 text-[10px] font-medium text-on-surface-variant">
                      {message.sender === 'model' ? <Bot className="w-3 h-3" /> : <UserRound className="w-3 h-3" />}
                      {message.sender === 'model' ? 'AI assistant' : message.sent_by?.name ?? 'Team member'}
                    </span>
                  )}
                  {message.content}
                </div>
              </div>
            )
          )}
        </div>
      </section>

      {closing && (
        <CloseTicketDialog ticketNumber={ticket.number} busy={saving} onCancel={() => setClosing(false)} onConfirm={confirmClose} />
      )}
    </PanelFrame>
  );
}

function PanelFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[28rem] z-40 flex flex-col bg-surface-container-low border-l border-outline-variant/30 shadow-xl">
      <div className="h-16 shrink-0 flex items-center justify-between gap-3 px-5 border-b border-outline-variant/30">
        <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close ticket panel" className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-6">{children}</div>
    </aside>
  );
}
