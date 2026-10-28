import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/errors';

/**
 * One way to tell the user an action failed: a toast (top right).
 * Takes an API error (axios) or a ready message. The same message is shown once, not stacked.
 */
export function notifyError(errorOrMessage: unknown, fallback = 'Something went wrong. Please try again.') {
  const message = typeof errorOrMessage === 'string' ? errorOrMessage : getApiErrorMessage(errorOrMessage, fallback);
  toast.error(message, { id: message });
}

export function notifySuccess(message: string) {
  toast.success(message, { id: message });
}
