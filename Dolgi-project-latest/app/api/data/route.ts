import { act, validate } from '@/lib/model';
import { siteIdentity } from '@/lib/access';
import { checkOrigin, clearAuthCookies, cloudSession, CloudError, reply, rpc, renewActivity } from '@/lib/supabase-http';
import { pinCookie, pinHash, pinLocked } from '@/lib/pin';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  let cookies: string[] = [];
  try {
    await siteIdentity(); const session = await cloudSession(req); cookies = session.cookies;
    const { state, user } = await rpc(session, 'dolgi_read');
    if (await pinLocked(req, user)) return reply({ locked: true, pinEnabled: true }, 423, cookies);
    validate(state);
    return reply({ state, revision: user.revision, pinEnabled: !!user.pin_hash, accountId: session.id }, 200, cookies);
  } catch (e) { const error = e instanceof CloudError ? e : new CloudError('Не удалось загрузить данные. Попробуйте ещё раз.'); return reply({ error: error.message }, error.status, error.status === 401 ? clearAuthCookies() : cookies); }
}
export async function POST(req: Request) {
  let cookies: string[] = [];
  try {
    checkOrigin(req); await siteIdentity(); const session = await cloudSession(req); cookies = session.cookies;
    if (!req.headers.get('content-type')?.includes('application/json')) throw new CloudError('Неверный формат', 400);
    const raw = await req.text(); if (raw.length > 5000000) throw new CloudError('Файл слишком большой', 413);
    const a = JSON.parse(raw);
    if (a.type === 'lock') return reply({ locked: true }, 200, [...cookies, clearAuthCookies()[2]]);
    const { state, user } = await rpc(session, 'dolgi_read'); validate(state);
    const response = (s = state, revision = user.revision, pinEnabled = !!user.pin_hash) => ({ state: s, revision, pinEnabled, accountId: session.id });
    const renew = async (u = user) => { const c = await pinCookie(u); if (c) cookies.push(c); cookies.push(await renewActivity(session)); };
    if (a.type === 'unlock') {
      if (user.blocked_until > Date.now()) throw new CloudError('Слишком много попыток. Повторите через 5 минут.', 429);
      if (typeof a.pin !== 'string' || !/^\d{6}$/.test(a.pin) || !user.pin_hash || await pinHash(a.pin, user.pin_salt) !== user.pin_hash) {
        await rpc(session, 'dolgi_pin', { p_action: 'fail' }); throw new CloudError('Неверный PIN', 403);
      }
      await rpc(session, 'dolgi_pin', { p_action: 'reset' }); await renew(); return reply(response(), 200, cookies);
    }
    if (await pinLocked(req, user)) return reply({ locked: true, pinEnabled: true }, 423, cookies);
    if (a.type === 'activity') { await renew(); return reply({ accountId: session.id, pinEnabled: !!user.pin_hash }, 200, cookies); }
    if (a.type === 'pin') {
      if (!/^\d{6}$/.test(a.pin || '')) throw new CloudError('PIN должен содержать 6 цифр', 400);
      const salt = crypto.randomUUID(), hash = await pinHash(a.pin, salt);
      await rpc(session, 'dolgi_pin', { p_action: 'set', p_hash: hash, p_salt: salt });
      await renew({ ...user, pin_hash: hash }); return reply(response(state, user.revision, true), 200, cookies);
    }
    if (a.type === 'removePin') { await rpc(session, 'dolgi_pin', { p_action: 'remove' }); cookies.push(await renewActivity(session)); return reply(response(state, user.revision, false), 200, [...cookies, clearAuthCookies()[2]]); }
    if (a.revision !== user.revision) throw new CloudError('Данные обновились на другом устройстве. Обновите экран и повторите.', 409);
    const next = act(state, a), revision = await rpc(session, 'dolgi_save', { expected_revision: user.revision, p_state: next });
    await renew(); return reply(response(next, revision), 200, cookies);
  } catch (e) { const error = e instanceof CloudError ? e : new CloudError(e instanceof Error && e.name === 'ZodError' ? 'Проверьте обязательные поля, суммы и даты.' : e instanceof Error ? e.message : 'Не удалось сохранить данные', 400); return reply({ error: error.message }, error.status, error.status === 401 ? clearAuthCookies() : cookies); }
}
