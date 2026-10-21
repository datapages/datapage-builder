// Two jobs, for requests the wizard can't make from the browser. Stores nothing.
//  - POST /token exchanges a GitHub OAuth code for a token. GitHub's token
//    endpoint needs the client secret and doesn't allow cross-origin requests.
//  - PATCH /redivis/tables/:ref/variables relays a variable metadata update to
//    Redivis with the user's own token. Redivis's API doesn't allow PATCH from
//    browsers (no Access-Control-Allow-Methods), and this is the only call relayed.

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** comma-separated origins the wizard is served from */
  ALLOWED_ORIGINS: string;
}

const REDIVIS_API = 'https://redivis.com/api/v1';
const RELAYED_PATH = /^\/redivis(\/tables\/[^/]+\/variables)$/;
const MAX_RELAY_BYTES = 2 * 1024 * 1024;

interface TokenRequest {
  code?: unknown;
  redirect_uri?: unknown;
  code_verifier?: unknown;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return json({ error: 'origin_not_allowed' }, 403);

    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const relayed = url.pathname.match(RELAYED_PATH);
    if (request.method === 'PATCH' && relayed) return relayToRedivis(request, relayed[1], cors);
    if (request.method !== 'POST' || url.pathname !== '/token') return json({ error: 'not_found' }, 404, cors);

    let body: TokenRequest;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_request', error_description: 'Body must be JSON' }, 400, cors);
    }
    const { code, redirect_uri, code_verifier } = body;
    if (typeof code !== 'string' || typeof redirect_uri !== 'string' || typeof code_verifier !== 'string') {
      return json({ error: 'invalid_request', error_description: 'code, redirect_uri, and code_verifier are required' }, 400, cors);
    }
    // only hand out tokens for redirects back to the wizard itself
    if (!allowed.some((o) => redirect_uri.startsWith(`${o}/`))) {
      return json({ error: 'invalid_request', error_description: 'redirect_uri not allowed' }, 400, cors);
    }

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'datapage-builder' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri,
        code_verifier,
      }),
    });
    const token = (await res.json()) as Record<string, unknown>;
    // GitHub reports bad codes with a 200 and an error field
    if (!res.ok || token.error || typeof token.access_token !== 'string') {
      return json({ error: token.error ?? 'exchange_failed', error_description: token.error_description }, 400, cors);
    }
    return json({ access_token: token.access_token, scope: token.scope, token_type: token.token_type }, 200, cors);
  },
};

async function relayToRedivis(request: Request, path: string, cors: Record<string, string>): Promise<Response> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'invalid_request', error_description: 'Missing Redivis token' }, 401, cors);
  const body = await request.text();
  if (body.length > MAX_RELAY_BYTES) return json({ error: 'invalid_request', error_description: 'Request too large' }, 413, cors);

  const res = await fetch(`${REDIVIS_API}${path}`, {
    method: 'PATCH',
    headers: { Authorization: auth, 'Content-Type': 'application/json', 'X-Redivis-Client': 'datapage-builder' },
    body,
  });
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store', ...cors },
  });
}

function json(data: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}
