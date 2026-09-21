import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as http from '../lib/supabase-http.ts';
const source = fs.readFileSync('app/api/auth/route.ts', 'utf8')
  .replace(/import \{[^\n]+\} from '@\/lib\/supabase-http';/, 'const {checkOrigin,clearAuthCookies,cloudSession,CloudError,emailSignIn,resendConfirmation,reply,rpc,supabaseRequest}=arguments[1];')
  .replaceAll('export ', '');
let signedIn = true;
const api = Function(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }) + ';return {POST};')(async () => { if (!signedIn) throw new http.CloudError('AUTH', 401); }, http);
const originalFetch = globalThis.fetch, originalError = console.error;
const logs = []; console.error = (...args) => logs.push(args.join(' '));
const request = body => new Request('https://app.test/api/auth', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://app.test' }, body: JSON.stringify(body) });
const credentials = { type: 'signup', email: ' test@example.invalid ', password: 'secret-test-password' };
try {
  let count = 0;
  globalThis.fetch = async (url, options) => {
    count++; assert.equal(JSON.parse(options.body).email, 'test@example.invalid');
    return Response.json({ id: 'unconfirmed', identities: [] });
  };
  let r = await api.POST(request(credentials)); assert.equal(r.status, 200); assert.equal((await r.json()).confirmation, true); assert.equal(r.headers.get('set-cookie'), null);
  r = await api.POST(request({ ...credentials, password: 'short' })); assert.equal(r.status, 400); assert.equal(count, 1);
  for (const [code, status, text] of [['email_address_not_authorized', 403, 'SMTP'], ['over_email_send_rate_limit', 429, 'лимит'], ['weak_password', 422, 'Пароль'], ['email_not_confirmed', 400, 'подтверждён']]) {
    globalThis.fetch = async () => Response.json({ code, msg: 'Do not expose test@example.invalid secret-test-password' }, { status });
    r = await api.POST(request(credentials)); assert.ok(!r.ok); const body = await r.json(); assert.ok(body.error.includes(text)); assert.ok(body.error.includes(code)); assert.ok(!body.error.includes(credentials.password)); assert.equal(r.headers.get('set-cookie'), null);
  }
  globalThis.fetch = async () => Response.json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, { status: 400 });
  r = await api.POST(request({ ...credentials, type: 'signin' })); assert.equal(r.status, 400); assert.match((await r.json()).error, /invalid_credentials/);
  globalThis.fetch = async (url, options) => { assert.ok(String(url).endsWith('/auth/v1/resend')); assert.deepEqual(JSON.parse(options.body), { type: 'signup', email: 'test@example.invalid' }); return Response.json({}); };
  r = await api.POST(request({ type: 'resend', email: credentials.email })); assert.equal(r.status, 200); assert.equal(r.headers.get('set-cookie'), null);

  assert.ok(logs.length > 0); assert.ok(logs.every(line => !line.includes('test@example') && !line.includes(credentials.password)));
  console.log('PASS: signup normalization, validation, actionable provider failures, safe logs, resend payload, no unauthenticated sessions, Supabase login');
} finally { globalThis.fetch = originalFetch; console.error = originalError; }
