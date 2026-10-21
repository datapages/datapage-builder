import { config } from '../config';
import { pkcePair, popupMessage, randomString } from './pkce';

const STORAGE_KEY = 'datapage-builder:redivis-token';
// Redivis posts the code back to the opener instead of redirecting, so no
// redirect URI has to be registered (same flow as the redivis npm package)
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob:auto';

interface StoredToken {
  accessToken: string;
  /** epoch seconds */
  expiresAt: number;
  /** the scopes requested, so a token from before a scope was added isn't reused */
  scope?: string;
}

export function getRedivisToken(): string | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as StoredToken | null;
    // treat tokens expiring in the next 5 minutes as expired
    if (stored && stored.scope === config.redivisScope && stored.expiresAt * 1000 > Date.now() + 5 * 60 * 1000) return stored.accessToken;
  } catch {
    // ignore
  }
  return null;
}

export function clearRedivisToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function signInWithRedivis(): Promise<string> {
  const state = randomString();
  const { verifier, challenge } = await pkcePair();
  const params = new URLSearchParams({
    scope: config.redivisScope,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const code = await popupMessage(`https://redivis.com/oauth/authorize?${params}`, 'redivis-auth', (event) => {
    if (event.origin !== 'https://redivis.com') return undefined;
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (data?.state !== state) throw new Error('Redivis sign-in failed: inconsistent state.');
    return data.code as string;
  });

  const res = await fetch('https://redivis.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  const token = await res.json();
  if (!res.ok) throw new Error(`Redivis sign-in failed: ${token.error_description ?? token.error ?? res.status}`);

  const stored: StoredToken = { accessToken: token.access_token, expiresAt: token.expires_at, scope: config.redivisScope };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // ignore, the token just won't survive a reload
  }
  return stored.accessToken;
}
