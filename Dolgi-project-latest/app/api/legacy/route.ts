import { siteIdentity } from '@/lib/access';
import { checkOrigin, cloudSession, CloudError, reply, clearAuthCookies } from '@/lib/supabase-http';
import { importLegacy, verifiedLegacy } from '@/lib/legacy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  let cookies: string[] = [];
  try {
    checkOrigin(req); const siteId = await siteIdentity(), session = await cloudSession(req); cookies = session.cookies;
    if (session.activeUntil <= Date.now()) throw new CloudError('Войдите снова перед переносом данных', 401);
    const raw = await req.text(); if (raw.length > 1024) throw new CloudError('Запрос слишком большой', 413);
    const a = JSON.parse(raw);
    if (a.type === 'backup') { const old = await verifiedLegacy(siteId, a.pin); return reply({ state: old.state }, 200, cookies); }
    if (a.type !== 'import') throw new CloudError('Неверное действие', 400);
    await importLegacy(siteId, session, a.pin);
    return reply({ ok: true }, 200, cookies);
  } catch (e) { const error = e instanceof CloudError ? e : new CloudError('Не удалось перенести записи. Прежний учёт сохранён.'); return reply({ error: error.message }, error.status, error.status === 401 ? clearAuthCookies() : cookies); }
}
