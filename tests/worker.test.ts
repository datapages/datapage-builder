import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker/src/index';

const env: Env = {
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
  ALLOWED_ORIGINS: 'https://datapages.github.io, http://localhost:5173',
};
const origin = 'https://datapages.github.io';
const body = { code: 'abc', redirect_uri: `${origin}/datapage-builder/callback/`, code_verifier: 'verifier' };

function post(data: unknown, headers: Record<string, string> = { Origin: origin }) {
  return new Request('https://auth.example/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('token exchange worker', () => {
  it('answers preflight for allowed origins only', async () => {
    const ok = await worker.fetch(new Request('https://auth.example/token', { method: 'OPTIONS', headers: { Origin: origin } }), env);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(origin);

    const bad = await worker.fetch(new Request('https://auth.example/token', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env);
    expect(bad.status).toBe(403);
  });

  it('exchanges a code with the client secret', async () => {
    const fetchMock = vi.fn(async () => Response.json({ access_token: 'gho_token', scope: 'repo,read:org', token_type: 'bearer' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await worker.fetch(post(body), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: 'gho_token', scope: 'repo,read:org', token_type: 'bearer' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(init.body as string)).toEqual({ client_id: 'client-id', client_secret: 'client-secret', ...body });
  });

  it("passes GitHub's errors through without a token", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'bad_verification_code', error_description: 'The code is incorrect.' })));
    const res = await worker.fetch(post(body), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_verification_code', error_description: 'The code is incorrect.' });
  });

  it('rejects redirects that do not go back to the wizard', async () => {
    const res = await worker.fetch(post({ ...body, redirect_uri: 'https://evil.example/callback/' }), env);
    expect(res.status).toBe(400);
  });

  it('rejects missing fields', async () => {
    const res = await worker.fetch(post({ code: 'abc' }), env);
    expect(res.status).toBe(400);
  });
});
