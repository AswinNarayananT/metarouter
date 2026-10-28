import { isAxiosError } from 'axios';

// "admin_password" -> "Admin password"
function fieldLabel(loc: unknown): string {
  if (!Array.isArray(loc) || loc.length === 0) return '';
  const field = String(loc[loc.length - 1]);
  if (field === 'body' || /^\d+$/.test(field)) return '';
  const words = field.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Extracts a user-facing message from an axios error, saying why it failed:
 * the server's own message when it sent one, otherwise what went wrong (no connection, timeout, server error).
 * FastAPI returns `detail` as a string for HTTPExceptions, an array for 422 validation errors,
 * and an object with `message` for some (module disabled).
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback;

  // 1. No answer at all: offline, server down, or blocked
  if (!err.response) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return 'The server took too long to respond. Please try again.';
    }
    return "Can't reach the server. Check your internet connection and try again.";
  }

  // 2. The server explained it
  const detail = err.response.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    const message = String(detail[0].msg).replace(/^Value error, /, '');
    const label = fieldLabel(detail[0].loc);
    return label ? `${label}: ${message}` : message;
  }
  if (detail && typeof detail === 'object' && typeof detail.message === 'string') return detail.message;

  // 3. No explanation: say what kind of failure it was
  const status = err.response.status;
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return "You don't have permission to do this.";
  if (status === 404) return `${fallback} (not found).`;
  if (status === 413) return 'The file is too large to upload.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return `Something went wrong on our side (error ${status}). Please try again in a moment.`;
  return fallback;
}
