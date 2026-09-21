import assert from 'node:assert/strict';
import { cloudSession, emailSignIn, githubExchange } from '../lib/supabase-http.ts';
const originalFetch = globalThis.fetch;
const previous = process.env.DOLGI_ALLOWED_EMAILS;
let account = { id: 'owner', email: 'owner@example.invalid', email_confirmed_at: '2026-01-01', is_anonymous: false };
globalThis.fetch = async url => String(url).endsWith('/auth/v1/user')
  ? Response.json(account)
  : Response.json({ access_token: 'access-test', refresh_token: 'refresh-test' });
const request = (cookie = 'dolgi_sb_access=access-test') => new Request('https://app.test/api/data', { headers: { cookie } });
try {
  delete process.env.DOLGI_ALLOWED_EMAILS;
  await assert.rejects(() => cloudSession(request()), e => e.status === 503);
  process.env.DOLGI_ALLOWED_EMAILS = ' OWNER@example.invalid ';
  assert.equal((await cloudSession(request())).id, 'owner');
  assert.equal((await cloudSession(request('dolgi_sb_refresh=refresh-test'))).id, 'owner');
  assert.equal((await emailSignIn(account.email, 'test-password', false)).confirmation, false);
  account = { ...account, email: 'stranger@example.invalid' };
  await assert.rejects(() => cloudSession(request()), e => e.status === 403);
  await assert.rejects(() => cloudSession(request('dolgi_sb_refresh=refresh-test')), e => e.status === 403);
  await assert.rejects(() => emailSignIn(account.email, 'test-password', false), e => e.status === 403);
  await assert.rejects(() => githubExchange(request('dolgi_github_verifier=' + 'a'.repeat(43)), 'test-code'), e => e.status === 403);
  await assert.rejects(() => cloudSession(new Request('https://app.test/api/data', { headers: { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.invalid' } })), e => e.status === 401);
  console.log('PASS: fail-closed owner access, verified email allowlist, refresh, password and GitHub login, forged platform headers');
} finally {
  globalThis.fetch = originalFetch;
  if (previous === undefined) delete process.env.DOLGI_ALLOWED_EMAILS; else process.env.DOLGI_ALLOWED_EMAILS = previous;
}
