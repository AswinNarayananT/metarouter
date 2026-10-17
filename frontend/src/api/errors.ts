import { isAxiosError } from 'axios';

/**
 * Extracts a user-facing message from an axios error.
 * FastAPI returns `detail` as a string for HTTPExceptions and as an array for 422 validation errors.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback;
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    return String(detail[0].msg).replace(/^Value error, /, '');
  }
  return fallback;
}
