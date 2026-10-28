import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Pencil, Plus, Trash2, Users, User, Zap } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { createQuickReply, deleteQuickReply, fetchQuickReplies, updateQuickReply } from '@/store/quickReplies/quickRepliesThunks';
import { QUICK_REPLY_MAX_CHARS, QUICK_REPLY_PLACEHOLDERS, SHORTCUT_PATTERN } from '@/utils/quickReplies';
import type { QuickReply } from '@/types/quickReplyTypes';

type Draft = { id: number | null; shared: boolean; shortcut: string; content: string };

const inputClass =
  'w-full px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary';

/** Team (shared) replies kept by admins and managers, plus each member's own. Used in chats with "/" or ⚡. */
export function QuickRepliesManager() {
  const dispatch = useAppDispatch();
  const { items, hasLoaded, isLoading, loadError } = useAppSelector((state) => state.quickReplies);
  const role = useAppSelector((state) => state.workspace.user?.role);
  const isSupervisor = role === 'admin' || role === 'manager';

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!hasLoaded) dispatch(fetchQuickReplies());
  }, [dispatch, hasLoaded]);

  const shared = items.filter((r) => r.scope === 'shared');
  const personal = items.filter((r) => r.scope === 'personal');

  const startNew = (isShared: boolean) => {
    setDraft({ id: null, shared: isShared, shortcut: '', content: '' });
    setError(null);
  };

  const startEdit = (reply: QuickReply) => {
    setDraft({ id: reply.id, shared: reply.scope === 'shared', shortcut: reply.shortcut, content: reply.content });
    setError(null);
  };

  // Placeholder buttons insert at the cursor in the reply text
  const insertPlaceholder = (token: string) => {
    if (!draft) return;
    const el = contentRef.current;
    const start = el?.selectionStart ?? draft.content.length;
    const end = el?.selectionEnd ?? draft.content.length;
    setDraft({ ...draft, content: draft.content.slice(0, start) + token + draft.content.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    if (!draft) return;
    const shortcut = draft.shortcut.trim().replace(/^\//, '').toLowerCase();
    const content = draft.content.trim();
    if (!SHORTCUT_PATTERN.test(shortcut)) {
      setError('Shortcut can use letters, numbers, - and _ only (up to 30, no spaces).');
      return;
    }
    if (!content) {
      setError('Reply text is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (draft.id === null) await dispatch(createQuickReply({ shortcut, content, shared: draft.shared })).unwrap();
      else await dispatch(updateQuickReply({ id: draft.id, shortcut, content })).unwrap();
      setDraft(null);
    } catch {
      // Shown as a toast (store/errorToastMiddleware); the form stays open to fix and retry
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await dispatch(deleteQuickReply(id)).unwrap();
      setConfirmDeleteId(null);
    } catch {
      // Shown as a toast (store/errorToastMiddleware)
    }
  };

  const form = (isShared: boolean) =>
    draft && draft.shared === isShared && (
      <div className="p-4 rounded-xl border border-primary/40 bg-surface space-y-3">
        <div>
          <label htmlFor="qr-shortcut" className="block text-xs font-semibold text-on-surface mb-1">
            Shortcut
          </label>
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm text-on-surface-variant">/</span>
            <input
              id="qr-shortcut"
              value={draft.shortcut}
              onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })}
              maxLength={31}
              placeholder="refund"
              autoFocus
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <label htmlFor="qr-content" className="text-xs font-semibold text-on-surface">
              Reply text
            </label>
            <div className="flex flex-wrap gap-1">
              {QUICK_REPLY_PLACEHOLDERS.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => insertPlaceholder(p.token)}
                  title={`Insert ${p.token}`}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-container text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  + {p.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            id="qr-content"
            ref={contentRef}
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            maxLength={QUICK_REPLY_MAX_CHARS}
            rows={4}
            placeholder="Hi {customer_name}, refunds reach your account in 5-7 working days."
            className={`${inputClass} resize-y`}
          />
          <p className="text-[11px] text-on-surface-variant mt-1 text-right">
            {draft.content.length} / {QUICK_REPLY_MAX_CHARS}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDraft(null)}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium text-on-surface hover:bg-surface-container cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    );

  const list = (replies: QuickReply[], emptyText: string) =>
    replies.length === 0 ? (
      <p className="text-sm text-on-surface-variant py-2">{emptyText}</p>
    ) : (
      <ul className="divide-y divide-outline-variant/30">
        {replies.map((reply) =>
          draft?.id === reply.id ? null : (
            <li key={reply.id} className="py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm font-semibold text-primary">/{reply.shortcut}</p>
                <p className="text-sm text-on-surface-variant whitespace-pre-wrap break-words line-clamp-3">{reply.content}</p>
              </div>
              {reply.can_edit &&
                (confirmDeleteId === reply.id ? (
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <span className="text-on-surface-variant">Delete?</span>
                    <button type="button" onClick={() => remove(reply.id)} className="font-semibold text-error hover:underline cursor-pointer">
                      Yes
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="font-semibold text-on-surface hover:underline cursor-pointer">
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => startEdit(reply)} aria-label={`Edit /${reply.shortcut}`} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId(reply.id)} aria-label={`Delete /${reply.shortcut}`} className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
            </li>
          )
        )}
      </ul>
    );

  const section = (isShared: boolean, replies: QuickReply[]) => {
    const canAdd = !isShared || isSupervisor;
    const Icon = isShared ? Users : User;
    return (
      <section className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-outline-variant/30">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-on-surface">{isShared ? 'Team replies' : 'My replies'}</h2>
              <p className="text-sm text-on-surface-variant mt-0.5">
                {isShared
                  ? isSupervisor
                    ? 'Everyone in the workspace can use these.'
                    : 'Shared by your admins and managers. Ask them to add or change one.'
                  : 'Only you see these.'}
              </p>
            </div>
          </div>
          {canAdd && !(draft && draft.id === null && draft.shared === isShared) && (
            <button
              type="button"
              onClick={() => startNew(isShared)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container text-on-surface rounded-lg text-xs font-medium hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>
        <div className="p-6 space-y-3">
          {form(isShared)}
          {list(replies, isShared ? 'No team replies yet.' : 'You have no personal replies yet.')}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-on-surface-variant">
        <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>
          In a chat, type <strong className="font-mono text-on-surface">/</strong> and the shortcut (or click ⚡) to insert a reply. Placeholders like{' '}
          <span className="font-mono">{'{customer_name}'}</span> are filled in, and you can edit the text before sending.
        </span>
      </div>

      {(error || loadError) && (
        <div role="alert" className="flex items-center gap-2 px-4 py-3 rounded-xl bg-error-container/20 border border-error/30 text-sm text-error">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error || loadError}</span>
        </div>
      )}

      {isLoading && !hasLoaded ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {section(true, shared)}
          {section(false, personal)}
        </>
      )}
    </div>
  );
}
