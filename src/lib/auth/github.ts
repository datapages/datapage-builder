import { config, githubRedirectUri } from '../config';
import { pkcePair, popupMessage, randomString } from './pkce';

const STORAGE_KEY = 'datapage-builder:github-token';
export const CALLBACK_MESSAGE_SOURCE = 'datapage-builder:github-callback';

export interface CallbackMessage {
  source: typeof CALLBACK_MESSAGE_SOURCE;
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export function getGitHubToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearGitHubToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function signInWithGitHub(): Promise<string> {
  if (!config.githubClientId || !config.tokenExchangeUrl) {
    throw new Error('GitHub sign-in is not configured (missing VITE_GITHUB_CLIENT_ID or VITE_TOKEN_EXCHANGE_URL).');
  }
  const state = randomString();
  const { verifier, challenge } = await pkcePair();
  const redirectUri = githubRedirectUri();
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    redirect_uri: redirectUri,
    scope: config.githubScope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  // the callback page is on our own origin and posts the code back here
  const code = await popupMessage(`https://github.com/login/oauth/authorize?${params}`, 'github-auth', (event) => {
    if (event.origin !== location.origin) return undefined;
    const data = event.data as CallbackMessage;
    if (data?.source !== CALLBACK_MESSAGE_SOURCE) return undefined;
    if (data.error) throw new Error(`GitHub sign-in failed: ${data.errorDescription ?? data.error}`);
    if (data.state !== state) throw new Error('GitHub sign-in failed: inconsistent state.');
    return data.code!;
  });

  const res = await fetch(config.tokenExchangeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri, code_verifier: verifier }),
  });
  const token = await res.json();
  if (!res.ok || !token.access_token) {
    throw new Error(`GitHub sign-in failed: ${token.error_description ?? token.error ?? res.status}`);
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, token.access_token);
  } catch {
    // ignore, the token just won't survive a reload
  }
  return token.access_token;
}
