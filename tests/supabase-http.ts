import assert from 'node:assert/strict';
import { cloudSession, emailSignIn, renewActivity, clearAuthCookies, CloudError, checkOrigin, reply } from '../lib/supabase-http.ts';
const originalFetch = globalThis.fetch, originalNow = Date.now, originalEnv = process.env.NODE_ENV;
Object.assign(process.env, { NODE_ENV: 'production' });
let now = originalNow(); Date.now = () => now;
const user = { id: 'verified-account', email: 'test@example.invalid', email_confirmed_at: '2026-01-01', is_anonymous: false };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const req = (cookies: string[]) => new Request('https://app.test/api/data', { headers: { cookie: cookies.map(c => c.split(';')[0]).join('; ') } });
let calls: string[] = [];
try {
  globalThis.fetch = async (url, options) => { calls.push(String(url)); assert.equal(new Headers(options?.headers).get('apikey')?.startsWith('sb_publishable_'), true); if (String(url).endsWith('/auth/v1/user')) return response(user); return response({ access_token: 'verified-access', refresh_token: 'refresh', expires_in: 3600 }); };
  const login = await emailSignIn('test@example.invalid', 'not-a-real-password', false);
  assert.equal(login.confirmation, false);
  assert.ok(login.cookies.every(c => c.includes('HttpOnly') && c.includes('Secure') && c.includes('SameSite=Strict')));
  globalThis.fetch = async () => response(user);
  const session = await cloudSession(req(login.cookies));
  assert.equal(session.id, user.id); assert.equal(session.activeUntil, now + 900000);
  await assert.rejects(() => cloudSession(req([])), (e: unknown) => e instanceof CloudError && e.status === 401);
  globalThis.fetch = async () => response({ ...user, email_confirmed_at: null });
  await assert.rejects(() => cloudSession(req(login.cookies)), /Подтвердите email/);
  globalThis.fetch = async () => response({ ...user, is_anonymous: true });
  await assert.rejects(() => cloudSession(req(login.cookies)), /Подтвердите email/);
  // Refresh verifies the returned identity against Auth and preserves the original idle deadline.
  calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    if (String(url).includes('grant_type=refresh_token')) return response({ access_token: 'new-verified-access', refresh_token: 'new-refresh', expires_in: 3600 });
    return new Headers(options?.headers).get('Authorization') === 'Bearer new-verified-access' ? response(user) : response({ error: 'expired' }, 401);
  };
  now += 60000;
  const refreshed = await cloudSession(req(login.cookies));
  assert.equal(refreshed.access, 'new-verified-access'); assert.equal(refreshed.activeUntil, session.activeUntil);
  assert.equal(calls.filter(url => url.endsWith('/auth/v1/user')).length, 2);
  globalThis.fetch = async () => response(user);
  now += 900000;
  assert.equal((await cloudSession(req(login.cookies))).activeUntil, 0, 'Idle must expire independently of the persistent login');
  const forged = [...login.cookies.filter(c => !c.startsWith('dolgi_active=')), 'dolgi_active=' + (now + 900000) + '.' + '0'.repeat(64)];
  assert.equal((await cloudSession(req(forged))).activeUntil, 0);
  const renewed = await renewActivity(session);
  assert.equal((await cloudSession(req([...login.cookies, renewed]))).activeUntil, now + 900000);
  assert.ok(clearAuthCookies().every(c => c.includes('Max-Age=0')));
  // Reopening days later refreshes expired access even without an activity cookie.
  now += 7 * 86400000;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('grant_type=refresh_token')) return response({ access_token: 'reopened-access', refresh_token: 'rotated-refresh' });
    return new Headers(options?.headers).get('Authorization') === 'Bearer reopened-access' ? response(user) : response({},401);
  };
  const reopened = await cloudSession(req(login.cookies.filter(c => !c.startsWith('dolgi_active='))));
  assert.equal(reopened.id,user.id);assert.equal(reopened.access,'reopened-access');
  assert.ok(reopened.cookies.some(c=>c.startsWith('dolgi_sb_refresh=rotated-refresh;')&&c.includes('Max-Age=31536000')));
  globalThis.fetch = async () => response({error:'revoked'},400);
  await assert.rejects(()=>cloudSession(req(login.cookies)),(e:unknown)=>e instanceof CloudError&&e.status===401);
  assert.throws(() => checkOrigin(new Request('https://app.test/api/data', { headers: { origin: 'https://other.test' } })), /отклонён/);
  assert.match(reply({ ok: true }, 200, login.cookies).headers.get('cache-control')!, /no-store/);
  console.log('PASS: verified email identity, no anonymous access, secure persistent cookies, token refresh, unextended idle deadline, tamper rejection and logout clearing');
} finally { globalThis.fetch = originalFetch; Date.now = originalNow; Object.assign(process.env, { NODE_ENV: originalEnv }); }
