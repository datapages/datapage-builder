// Exchanges a GitHub OAuth code for a token. GitHub's token endpoint needs the
// client secret and doesn't allow cross-origin requests, so the wizard can't
// call it directly. Stores nothing.

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** comma-separated origins the wizard is served from */
  ALLOWED_ORIGINS: string;
}

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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
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

function json(data: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}
