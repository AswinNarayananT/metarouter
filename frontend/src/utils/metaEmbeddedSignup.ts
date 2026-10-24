/*
 * Meta's WhatsApp Embedded Signup popup.
 * The app id / config id come from our backend (.env) when the admin clicks Connect — nothing is hard-coded here,
 * and the app secret never reaches the browser (the backend exchanges the one-time code).
 */

export interface SignupConfig {
  app_id: string;
  config_id: string;
  api_version: string;
}

export interface SignupResult {
  code: string;                // One-time code, valid ~30 seconds: send it to the backend straight away
  wabaId: string | null;       // From the popup's "finished" message; null if it didn't arrive
  phoneNumberId: string | null; // (the backend then finds them from what the business shared with the token)
  businessId: string | null;    // The business that ran the setup (lets the backend look up its accounts)
}

// After the login callback, how long to wait for the popup's "finished" message before sending the code anyway
const SESSION_WAIT_MS = 2500;

interface FacebookSdk {
  init: (options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

const SDK_URL = 'https://connect.facebook.net/en_US/sdk.js';
let sdkPromise: Promise<FacebookSdk> | null = null;
let initializedAppId: string | null = null;

// Load Meta's SDK once, only when someone actually connects a number
function loadSdk(): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      window.fbAsyncInit = () => (window.FB ? resolve(window.FB) : reject(new Error("Meta's login script didn't start")));
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onerror = () => {
        sdkPromise = null;
        reject(new Error("Couldn't load Meta's login script. Check your connection or ad blocker and try again."));
      };
      document.body.appendChild(script);
    });
  }
  return sdkPromise;
}

/** Opens the popup; resolves with the code + the account and number the business picked. */
export async function runEmbeddedSignup(config: SignupConfig): Promise<SignupResult> {
  const FB = await loadSdk();
  if (initializedAppId !== config.app_id) {
    FB.init({ appId: config.app_id, autoLogAppEvents: true, xfbml: true, version: config.api_version });
    initializedAppId = config.app_id;
  }

  return new Promise((resolve, reject) => {
    let code: string | null = null;
    let session: { wabaId: string | null; phoneNumberId: string | null; businessId: string | null } | null = null;
    let done = false;

    const finish = (error?: Error) => {
      if (done) return;
      if (error) {
        done = true;
        window.removeEventListener('message', onMessage);
        reject(error);
      } else if (code && session) {
        done = true;
        window.removeEventListener('message', onMessage);
        resolve({ code, ...session });
      }
    };

    // Code without the "finished" message: send the code anyway (it expires fast); the backend finds the ids
    const sendWithoutSession = () => {
      if (done || !code) return;
      done = true;
      window.removeEventListener('message', onMessage);
      resolve({ code, wabaId: null, phoneNumberId: null, businessId: null });
    };

    // 1. The popup reports what the business picked (FINISH) or that they left (CANCEL / ERROR)
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return; // Only Meta's popup
      let data: { type?: string; event?: string; data?: Record<string, string> };
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      console.info('[WhatsApp signup] message from Meta:', data); // Helps diagnose setup problems (no secrets in it)

      if (data.event?.startsWith('FINISH')) {
        session = { wabaId: data.data?.waba_id ?? null, phoneNumberId: data.data?.phone_number_id ?? null, businessId: data.data?.business_id ?? null };
        finish();
      } else if (data.event === 'CANCEL') {
        const reason = data.data?.error_message;
        finish(new Error(reason ? `Meta reported a problem: ${reason}` : 'WhatsApp setup was cancelled before it finished.'));
      } else if (data.event === 'ERROR') {
        finish(new Error(data.data?.error_message ? `Meta reported a problem: ${data.data.error_message}` : 'WhatsApp setup failed in the Meta window.'));
      }
    };
    window.addEventListener('message', onMessage);

    // 2. The login callback carries the one-time code (it can arrive before or after the session message)
    FB.login(
      (response) => {
        console.info('[WhatsApp signup] login result:', response.authResponse?.code ? 'code received' : response.status);
        if (response.authResponse?.code) {
          code = response.authResponse.code;
          finish();
          window.setTimeout(sendWithoutSession, SESSION_WAIT_MS);
        } else {
          finish(new Error('WhatsApp setup was cancelled before it finished.'));
        }
      },
      {
        config_id: config.config_id,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' }, // sessionInfoVersion makes Meta post the FINISH message with the ids
      }
    );
  });
}
