import { useEffect, useState } from 'react';
import { api } from '@/api/axios';
import { store } from '@/store';
import type { ChatAttachment } from '@/types/chatTypes';

// <img src> / <iframe src> can't send the login token, so files are fetched with axios and shown from a
// blob URL. Each file is fetched once per session; logging out frees them all.
const cache = new Map<number, Promise<string>>();

let wasLoggedIn = Boolean(store.getState().workspace.token);
store.subscribe(() => {
  const loggedIn = Boolean(store.getState().workspace.token);
  if (wasLoggedIn && !loggedIn) {
    cache.forEach((url) => url.then(URL.revokeObjectURL, () => {}));
    cache.clear();
  }
  wasLoggedIn = loggedIn;
});

function loadAttachment(id: number): Promise<string> {
  let url = cache.get(id);
  if (!url) {
    url = api
      .get<Blob>(`/api/v1/attachments/${id}/file`, { responseType: 'blob' })
      .then((response) => URL.createObjectURL(response.data));
    // A failed fetch can be retried the next time the file is shown
    url.catch(() => cache.delete(id));
    cache.set(id, url);
  }
  return url;
}

// Blob URL of a customer's file once it has downloaded on the server; null while loading or unavailable.
// `enabled` = false skips the fetch (e.g. a card that only shows an icon for non-images)
export function useAttachmentUrl(attachment: ChatAttachment, enabled = true): { url: string | null; failed: boolean } {
  const ready = enabled && attachment.downloadStatus === 'done';
  const [result, setResult] = useState<{ id: number; url: string | null; failed: boolean }>({ id: attachment.id, url: null, failed: false });

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    loadAttachment(attachment.id).then(
      (url) => !cancelled && setResult({ id: attachment.id, url, failed: false }),
      () => !cancelled && setResult({ id: attachment.id, url: null, failed: true })
    );
    return () => {
      cancelled = true;
    };
  }, [attachment.id, ready]);

  // Ignore a result that belongs to a previously shown file
  if (result.id !== attachment.id) return { url: null, failed: false };
  return { url: result.url, failed: result.failed || attachment.downloadStatus === 'failed' };
}
