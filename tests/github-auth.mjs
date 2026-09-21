import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as http from '../lib/supabase-http.ts';
import { finishOAuthCallback, supabase } from '../lib/supabase-client.ts';
const source = fs.readFileSync('app/api/auth/github/route.ts', 'utf8')
  .replace(/import \{[^\n]+\} from '@\/lib\/supabase-http';/, 'const {checkOrigin,CloudError,githubExchange,githubPrepare,githubVerifierCookie,reply}=arguments[1];').replaceAll('export ', '');
let allowed = true;
const api = Function(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }) + ';return {POST};')(async () => { if (!allowed) throw new http.CloudError('AUTH', 401); }, http);
const originalFetch = globalThis.fetch;
const account = { id: 'test-verified-github', email: 'test@example.invalid', email_confirmed_at: '2026-01-01', is_anonymous: false };
const req = (body, cookie = '', origin = 'https://app.test') => new Request('https://app.test/api/auth/github', { method: 'POST', headers: { 'content-type': 'application/json', origin, cookie }, body: JSON.stringify(body) });
const cookies = response => response.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
let calls = 0, challenge;
try {
  let response;
  globalThis.fetch = async (target, options) => {
    assert.equal(target, '/api/auth/github');
    response = await api.POST(req(JSON.parse(options.body)));
    return response.clone();
  };
  const oauth = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: 'https://app.test', skipBrowserRedirect: true } });
  assert.equal(oauth.error, null);
  assert.equal(response.status, 200);
  const start = oauth.data, url = new URL(start.url), verifierCookie = cookies(response);
  assert.equal(url.origin, http.SUPABASE_URL); assert.equal(url.pathname, '/auth/v1/authorize');
  assert.equal(url.searchParams.get('provider'), 'github');
  assert.equal(url.searchParams.get('redirect_to'), 'https://app.test');
  challenge = url.searchParams.get('code_challenge'); assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=600/);
  const verifier = verifierCookie.split('=')[1];
  assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url'), challenge);
  globalThis.fetch = async (target, options) => {
    calls++;
    if (String(target).includes('grant_type=pkce')) {
      assert.deepEqual(JSON.parse(options.body), { auth_code: 'test-code', code_verifier: verifier });
      return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 });
    }
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer test-access');
    if (String(target).endsWith('/auth/v1/user')) return Response.json(account);
    if (String(target).endsWith('/rest/v1/rpc/dolgi_read')) return Response.json({ state: { people: [{ name: 'Test person' }] }, user: { revision: 1 } });
    throw Error('Unexpected endpoint');
  };
  response = await api.POST(req({ type: 'callback', code: 'test-code' }, verifierCookie));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  const sessionCookies = cookies(response);
  assert.match(response.headers.get('set-cookie'), /dolgi_github_verifier=;.*Max-Age=0/);
  const session = await http.cloudSession(new Request('https://app.test/api/data', { headers: { cookie: sessionCookies } }));
  assert.equal(session.id, account.id); assert.ok(session.activeUntil > Date.now());
  const data = await http.rpc(session, 'dolgi_read'); assert.equal(data.state.people[0].name, 'Test person');
  assert.ok(!JSON.stringify(start).includes(verifier));
  const before = calls;
  response = await api.POST(req({ type: 'callback', code: 'test-code' })); assert.equal(response.status, 400); assert.equal(calls, before);
  response = await api.POST(req({ type: 'prepare', verifier: JSON.stringify('bad;cookie') })); assert.equal(response.status, 400);
  response = await api.POST(req({ type: 'prepare', verifier: JSON.stringify(verifier) }, '', 'https://evil.test')); assert.equal(response.status, 403);
  globalThis.fetch = async () => Response.json({ error: 'Do not display private provider details' }, { status: 400 });
  response = await api.POST(req({ type: 'callback', code: 'test-code' }, verifierCookie)); assert.equal(response.status, 400); assert.match((await response.json()).error, /GitHub/); assert.ok(!cookies(response).includes('dolgi_sb_access'));
  let cleanURL, removed = false;
  globalThis.window = { location: { href: 'https://app.test/?code=test-code&keep=1' }, history: { state: null, replaceState(_state, _title, url) { cleanURL = url; } } };
  globalThis.sessionStorage = { removeItem(key) { assert.equal(key, 'dolgi-reauth'); removed = true; } };
  globalThis.fetch = async (target, options) => { assert.equal(cleanURL, '/?keep=1'); assert.deepEqual(JSON.parse(options.body), { type: 'callback', code: 'test-code' }); return Response.json({ ok: true }); };
  assert.equal(await finishOAuthCallback(), null); assert.equal(removed, true);
  window.location.href = 'https://app.test/?error=access_denied&error_description=private';
  globalThis.fetch = async () => { throw Error('Cancellation must not exchange a code'); };
  assert.match(await finishOAuthCallback(), /отменён/); assert.equal(cleanURL, '/');
  window.location.href = 'https://app.test/'; assert.equal(await finishOAuthCallback(), null);
  globalThis.fetch = async () => { throw new TypeError('Network failure'); };
  await assert.rejects(() => supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: 'https://app.test', skipBrowserRedirect: true } }), /Network failure/);
  console.log('PASS: official Supabase SDK start with mocked Auth responses -> PKCE callback -> verified session -> same-user data; cookie security, missing verifier, provider failure, origin guards, URL cleanup, reauth reset, cancellation and network failure');
} finally { globalThis.fetch = originalFetch; delete globalThis.window; delete globalThis.sessionStorage; }
