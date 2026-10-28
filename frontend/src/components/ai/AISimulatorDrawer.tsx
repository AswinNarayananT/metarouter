import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, FileText, Hand, Loader2, RotateCcw, Send, User, X } from 'lucide-react';
import { api } from '@/api/axios';
import { notifyError } from '@/utils/notify';
import type { SimulatorOutcome, SimulatorResponse, SimulatorTurn } from '@/types/aiSimulatorTypes';

const HISTORY_TURNS = 10;     // Same amount of earlier conversation a live chat gives the AI
const WEAK_MATCH_SCORE = 55;  // Below this the knowledge base probably doesn't cover the question

const EXAMPLES = [
  'What are your timings?',
  'How much are the fees?',
  "I paid but didn't get my receipt",
  'I want to talk to a person',
  "No thanks, that's all",
];

const OUTCOMES: Record<SimulatorOutcome, { label: string; icon: React.ElementType; className: string }> = {
  answered: { label: 'Answered', icon: CheckCircle2, className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25' },
  escalated: { label: 'Hands over to team', icon: Hand, className: 'bg-amber-500/10 text-amber-700 border-amber-500/25' },
  resolved: { label: 'Closes ticket', icon: CheckCircle2, className: 'bg-primary/10 text-primary border-primary/25' },
  error: { label: "Couldn't answer", icon: AlertTriangle, className: 'bg-error/10 text-error border-error/25' },
};

/**
 * "Try it": a test chat with the AI using the SAVED rules and knowledge base, the same prompt and models
 * as live chats. Shows the reply, what a real chat would do with it, and the knowledge passages it found.
 * Nothing is saved or sent to anyone.
 */
export function AISimulatorDrawer({ open, onClose, hasUnsavedChanges }: { open: boolean; onClose: () => void; hasUnsavedChanges: boolean }) {
  const [turns, setTurns] = useState<SimulatorTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Escape closes; the cursor goes to the question box
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, sending]);

  const ask = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;

    // Earlier answered turns only (a failed request isn't part of the conversation)
    const history = turns
      .filter((t) => !t.failed && !(t.role === 'assistant' && t.result?.outcome === 'error'))
      .slice(-HISTORY_TURNS)
      .map((t) => ({ role: t.role, text: t.text }));

    setTurns((prev) => [...prev, { role: 'customer', text: message }]);
    setDraft('');
    setSending(true);
    try {
      const { data } = await api.post<SimulatorResponse>('/api/v1/ai-settings/simulate', { message, history });
      setTurns((prev) => [...prev, { role: 'assistant', text: data.reply, result: data }]);
    } catch (err) {
      notifyError(err, "Couldn't test the AI. Please try again.");
      setTurns((prev) => [...prev, { role: 'assistant', text: '', failed: true }]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Test your AI">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <aside className="relative w-full sm:w-[440px] h-full flex flex-col bg-surface border-l border-outline-variant/40 shadow-2xl">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-outline-variant/30 bg-surface-container-low space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-on-surface">Test your AI</h2>
              <p className="text-xs text-on-surface-variant">Ask like a customer. Nothing is saved or sent to anyone.</p>
            </div>
            <button
              type="button"
              onClick={() => setTurns([])}
              disabled={turns.length === 0 || sending}
              title="Start a new test conversation"
              className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
          {hasUnsavedChanges && (
            <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              You have unsaved changes. The test uses your saved settings, so save to try them.
            </p>
          )}
        </div>

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {turns.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-on-surface-variant">Try a question, or one of these to check answers and handovers:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => ask(example)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant/30 cursor-pointer"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, index) =>
            turn.role === 'customer' ? (
              <div key={index} className="flex justify-end gap-2">
                <p className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-tr-md bg-primary text-on-primary text-sm whitespace-pre-wrap break-words">{turn.text}</p>
                <span className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center shrink-0" aria-hidden="true">
                  <User className="w-3.5 h-3.5 text-on-surface-variant" />
                </span>
              </div>
            ) : (
              <AssistantTurn key={index} turn={turn} />
            )
          )}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <Loader2 className="w-4 h-4 animate-spin" /> The AI is thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Question box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="shrink-0 p-3 border-t border-outline-variant/30 bg-surface-container-low flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask(draft);
              }
            }}
            maxLength={2000}
            placeholder="Type a customer question…"
            aria-label="Customer question"
            className="flex-1 resize-none max-h-32 px-3.5 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send test question"
            className="h-10 w-10 shrink-0 rounded-xl bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 cursor-pointer"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </aside>
    </div>
  );
}

function AssistantTurn({ turn }: { turn: SimulatorTurn }) {
  const [showSources, setShowSources] = useState(false);
  const result = turn.result;

  if (turn.failed || !result) {
    return (
      <div className="flex gap-2">
        <BotAvatar />
        <p className="px-3.5 py-2 rounded-2xl rounded-tl-md bg-error/10 text-error text-sm">Couldn't get a reply. The reason is shown at the top right.</p>
      </div>
    );
  }

  const outcome = OUTCOMES[result.outcome];
  const OutcomeIcon = outcome.icon;
  const weakMatch = result.outcome !== 'error' && (!result.has_knowledge || (result.best_score ?? 0) < WEAK_MATCH_SCORE);

  return (
    <div className="flex gap-2">
      <BotAvatar />
      <div className="flex-1 min-w-0 space-y-2">
        {result.reply && (
          <p className="px-3.5 py-2 rounded-2xl rounded-tl-md bg-surface-container-low border border-outline-variant/30 text-sm text-on-surface whitespace-pre-wrap break-words">
            {result.reply}
          </p>
        )}

        {/* What a real chat would do */}
        <div className={`px-3 py-2 rounded-xl border text-xs ${outcome.className}`}>
          <p className="flex items-center gap-1.5 font-semibold">
            <OutcomeIcon className="w-3.5 h-3.5" /> {outcome.label}
            <span className="ml-auto font-normal opacity-70">{(result.elapsed_ms / 1000).toFixed(1)}s</span>
          </p>
          <p className="mt-0.5 opacity-90">{result.outcome_note}</p>
        </div>

        {weakMatch && (
          <p className="flex items-start gap-1.5 px-3 py-2 rounded-xl bg-surface-container text-xs text-on-surface-variant">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-amber-600" />
            {result.has_knowledge
              ? "No close match in your knowledge base. This answer comes from your rules only, so check it's correct."
              : 'Your knowledge base is empty, so this answer comes from your rules only. Upload documents to give the AI facts.'}
          </p>
        )}

        {/* Knowledge passages the AI was given */}
        {result.sources.length > 0 && (
          <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSources((s) => !s)}
              aria-expanded={showSources}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-primary" />
              Sources ({result.sources.length}) · best match {result.best_score}%
              <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showSources ? 'rotate-180' : ''}`} />
            </button>
            {showSources && (
              <ul className="divide-y divide-outline-variant/20 border-t border-outline-variant/20">
                {result.sources.map((source, i) => (
                  <li key={i} className="px-3 py-2 space-y-1">
                    <p className="flex items-center gap-2 text-xs">
                      <span className="flex-1 min-w-0 truncate font-medium text-on-surface">{source.title}</span>
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${
                          source.score >= WEAK_MATCH_SCORE ? 'bg-emerald-500/10 text-emerald-700' : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        {source.score}% match
                      </span>
                    </p>
                    <p className="text-[11px] text-on-surface-variant line-clamp-4 whitespace-pre-wrap">{source.preview}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BotAvatar() {
  return (
    <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0" aria-hidden="true">
      <Bot className="w-3.5 h-3.5 text-primary" />
    </span>
  );
}
