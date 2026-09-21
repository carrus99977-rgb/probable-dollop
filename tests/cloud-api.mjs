import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as model from '../lib/model.ts';
import * as http from '../lib/supabase-http.ts';
import * as pin from '../lib/pin.ts';
let currentUser = 'alice', siteSignedIn = true, activeUntil = Date.now() + 900000;
const accounts = new Map(['alice', 'bob'].map(id => [id, { state: model.seed(), user: { id, revision: 1, pin_hash: null, pin_salt: null, attempts: 0, blocked_until: 0 } }]));
const cloud = { ...http,
  cloudSession: async () => { if (!currentUser) throw new http.CloudError('Войдите', 401); return { id: currentUser, email: currentUser + '@example.invalid', access: 'test-access', cookies: [], activeUntil }; },
  rpc: async (session, name, a) => {
    const entry = accounts.get(session.id), user = entry.user;
    if (name === 'dolgi_read') return structuredClone(entry);
    if (name === 'dolgi_pin') {
      if (a.p_action === 'set') { user.pin_hash = a.p_hash; user.pin_salt = a.p_salt; user.attempts = 0; user.blocked_until = 0; }
      if (a.p_action === 'fail') { if (user.attempts >= 4) user.blocked_until = Date.now() + 300000; user.attempts++; }
      if (a.p_action === 'reset') { user.attempts = 0; user.blocked_until = 0; }
      if (a.p_action === 'remove') user.pin_hash = null;
      return;
    }
    assert.equal(name, 'dolgi_save'); if (a.expected_revision !== user.revision) throw new http.CloudError('Conflict', 409);
    entry.state = model.validate(a.p_state); return ++user.revision;
  }
};
let source = fs.readFileSync('app/api/data/route.ts', 'utf8')
  .replace("import { act, validate } from '@/lib/model';", 'const {act,validate}=arguments[0];')
  .replace("import { checkOrigin, clearAuthCookies, cloudSession, CloudError, reply, rpc, renewActivity } from '@/lib/supabase-http';", 'const {checkOrigin,clearAuthCookies,cloudSession,CloudError,reply,rpc,renewActivity}=arguments[2];')
  .replace("import { pinCookie, pinHash, pinLocked } from '@/lib/pin';", 'const {pinCookie,pinHash,pinLocked}=arguments[3];').replaceAll('export ', '');
const api = Function(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }) + ';return {GET,POST};')(model, async () => { if (!siteSignedIn) throw new http.CloudError('AUTH', 401); return 'platform-owner'; }, cloud, pin);
const request = (body, cookie = '') => new Request('https://app.test/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
const get = cookie => new Request('https://app.test/api/data', { headers: { cookie: cookie || '' } });
const oldNow = Date.now, oldEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
try {
  currentUser = null; assert.equal((await api.GET(get())).status, 401); assert.equal((await api.POST(request({ type: 'activity' }))).status, 401);
  currentUser = 'alice';
  let r = await api.GET(get()); assert.equal(r.status, 200); assert.equal((await r.json()).accountId, 'alice');
  r = await api.POST(request({ type: 'return', id: 'd2', amount: '1000', date: model.today(), revision: 1, userId: 'bob' })); assert.equal(r.status, 200);
  assert.equal(model.remaining(accounts.get('alice').state, accounts.get('alice').state.debts[2]), 4400000);
  assert.equal(model.remaining(accounts.get('bob').state, accounts.get('bob').state.debts[2]), 4500000);
  assert.equal((await api.POST(request({ type: 'clear', revision: 1 }))).status, 409);
  const attack = new Request('https://app.test/api/data', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.test' }, body: JSON.stringify({ type: 'clear', revision: 2 }) });
  assert.equal((await api.POST(attack)).status, 403);
  const bobBeforeDeletion = structuredClone(accounts.get('bob'));
  r = await api.POST(request({ type: 'deleteDebt', id: 'd2', revision: 2, userId: 'bob' })); assert.equal(r.status, 200);
  assert.equal((await r.json()).revision, 3);
  const afterDeletion = await (await api.GET(get())).json();
  assert.ok(!afterDeletion.state.debts.some(d => d.id === 'd2'));
  assert.ok(!afterDeletion.state.transactions.some(t => t.debtId === 'd2'));
  assert.deepEqual(accounts.get('bob'), bobBeforeDeletion);
  assert.equal((await api.POST(request({ type: 'deleteDebt', id: 'd1', revision: 2 }))).status, 409);
  assert.ok(accounts.get('alice').state.debts.some(d => d.id === 'd1'));
  activeUntil = Date.now() - 7 * 86400000; r = await api.GET(get()); assert.equal(r.status, 200); assert.ok((await r.json()).state);
  r = await api.POST(request({type:'note',personId:'p0',text:'After a week away',revision:3})); assert.equal(r.status,200);
  activeUntil = Date.now() + 900000;
  r = await api.POST(request({ type: 'pin', pin: '471829' })); assert.equal(r.status, 200); const aliceCookie = r.headers.get('set-cookie'); assert.match(aliceCookie, /HttpOnly/); assert.match(aliceCookie, /Secure/);
  assert.equal((await api.GET(get())).status, 423); assert.equal((await api.GET(get(aliceCookie))).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await api.POST(request({ type: 'unlock', pin: '000000' }))).status, 403);
  assert.equal((await api.POST(request({ type: 'unlock', pin: '471829' }))).status, 429);
  currentUser = 'bob'; r = await api.POST(request({ type: 'pin', pin: '582930' })); const bobCookie = r.headers.get('set-cookie');
  assert.equal((await api.GET(get(aliceCookie))).status, 423);
  const start = oldNow(); Date.now = () => start + 14 * 60000;
  r = await api.POST(request({ type: 'activity' }, bobCookie)); assert.equal(r.status, 200); const renewed = r.headers.get('set-cookie');
  Date.now = () => start + 16 * 60000;
  assert.equal((await api.GET(get(bobCookie))).status, 423); assert.equal((await api.GET(get(renewed))).status, 200);
  assert.equal((await api.POST(request({ type: 'clear', revision: 1 }, bobCookie))).status, 423);
  console.log('PASS: cloud API authentication, persistent login after inactivity, owner spoof rejection, revision conflict, PIN protection/rate limit, account-bound lock, expiry and renewal');
} finally { Date.now = oldNow; process.env.NODE_ENV = oldEnv; }
