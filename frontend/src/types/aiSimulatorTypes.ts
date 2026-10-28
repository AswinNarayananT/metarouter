// Shapes from POST /api/v1/ai-settings/simulate (backend/app/api/v1/ai_settings.py)
export type SimulatorOutcome = 'answered' | 'escalated' | 'resolved' | 'error';

export interface SimulatorSource {
  title: string;              // "<file> · page N" (older uploads: "<file> - Part N")
  document_id: number | null;
  score: number;              // How closely it matches the question, 0-100
  preview: string;
}

export interface SimulatorResponse {
  reply: string;              // What the customer would see (tags removed)
  outcome: SimulatorOutcome;
  outcome_note: string;       // What a real chat would do with it
  sources: SimulatorSource[];
  best_score: number | null;
  has_knowledge: boolean;
  elapsed_ms: number;
}

export interface SimulatorTurn {
  role: 'customer' | 'assistant';
  text: string;
  result?: SimulatorResponse; // On assistant turns
  failed?: boolean;           // The request itself failed (network, limit)
}
