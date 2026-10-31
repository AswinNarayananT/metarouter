import { useAppSelector } from '@/store';

// AI Assistant's auto-reply switch (on until the admin turns it off). Off: every new chat goes straight to the team,
// so "hand back to AI" controls are hidden
export function useAiAutoReply(): boolean {
  return useAppSelector((state) => state.workspace.organization?.ai_auto_reply) !== false;
}
