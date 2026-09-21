import { db, read } from './storage';
import { CloudError, rpc } from './supabase-http';
import type { CloudSession } from './supabase-http';
import { pinHash } from './pin';
export async function legacyInfo(siteId: string, cloud: CloudSession, profile: any, state: any) {
  const link = await db().prepare('SELECT * FROM cloud_links WHERE user_id=?').bind(siteId).first<any>();
  if (link?.completed || link && link.cloud_user_id !== cloud.id || profile.legacy_imported) return null;
  const exists = await db().prepare('SELECT id FROM users WHERE id=?').bind(siteId).first();
  if (!exists) return null;
  const old = await read(siteId);
  if (!old.state.debts.length && !old.state.people.length && !old.user.pin_hash) return null;
  return { debts: old.state.debts.length, people: old.state.people.length, pinEnabled: !!old.user.pin_hash, canImport: !state.debts.length && !state.people.length };
}
export async function verifiedLegacy(siteId: string, pin: unknown) {
  const old = await read(siteId);
  if (old.user.pin_hash) {
    if (old.user.blocked_until > Date.now()) throw new CloudError('Слишком много попыток. Повторите через 5 минут.', 429);
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin) || await pinHash(pin, old.user.pin_salt) !== old.user.pin_hash) {
      await db().prepare('UPDATE users SET attempts=attempts+1,blocked_until=CASE WHEN attempts>=4 THEN ? ELSE 0 END WHERE id=?').bind(Date.now() + 300000, siteId).run();
      throw new CloudError('Неверный PIN прежнего учёта', 403);
    }
    await db().prepare('UPDATE users SET attempts=0,blocked_until=0 WHERE id=?').bind(siteId).run();
  }
  return old;
}
export async function importLegacy(siteId: string, cloud: CloudSession, pin: unknown) {
  const current = await rpc(cloud, 'dolgi_read');
  const info = await legacyInfo(siteId, cloud, current.user, current.state);
  if (!info?.canImport) throw new CloudError('Облачный учёт уже содержит данные. Прежние записи сохранены отдельно.', 409);
  const old = await verifiedLegacy(siteId, pin);
  await db().prepare('INSERT INTO cloud_links(user_id,cloud_user_id) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING').bind(siteId, cloud.id).run();
  const link = await db().prepare('SELECT cloud_user_id FROM cloud_links WHERE user_id=?').bind(siteId).first<any>();
  if (link?.cloud_user_id !== cloud.id) throw new CloudError('Прежний учёт уже привязан к другому email-аккаунту', 409);
  await rpc(cloud, 'dolgi_import', { expected_revision: current.user.revision, p_state: old.state, p_hash: old.user.pin_hash, p_salt: old.user.pin_salt });
  await db().prepare('UPDATE cloud_links SET completed=1 WHERE user_id=? AND cloud_user_id=?').bind(siteId, cloud.id).run();
  // The original ledger remains intact in D1 as a recovery copy.
}
