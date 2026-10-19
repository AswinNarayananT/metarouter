// Backend base URL, from VITE_API_URL (frontend/.env for `npm run dev`, the root .env for Docker builds).
// No fallback: a build without it would silently call localhost in production.
export const API_BASE_URL: string = import.meta.env.VITE_API_URL;

if (!API_BASE_URL) {
  throw new Error('VITE_API_URL is not set. Add it to frontend/.env (dev) or the root .env (Docker build).');
}

// WebSocket base URL for live chat updates, from VITE_WS_URL (ws:// locally, wss:// behind HTTPS).
export const WS_BASE_URL: string = import.meta.env.VITE_WS_URL;

if (!WS_BASE_URL) {
  throw new Error('VITE_WS_URL is not set. Add it to frontend/.env (dev) or the root .env (Docker build).');
}
