const enc = new TextEncoder();
export async function pinHash(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const v = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(v)).map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function pinCookie(user: any) {
  if (!user.pin_hash) return undefined;
  const expiry = Date.now() + 900000;
  const k = await crypto.subtle.importKey('raw', enc.encode(user.pin_hash), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const h = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(user.id + ':' + expiry)))).map(x => x.toString(16).padStart(2, '0')).join('');
  return `dolgi_lock=${expiry}.${h}; Path=/; HttpOnly; SameSite=Strict; Max-Age=900${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export async function pinLocked(req: Request, user: any) {
  if (!user.pin_hash) return false;
  const v = req.headers.get('cookie')?.match(/(?:^|; )dolgi_lock=([^;]+)/)?.[1]?.split('.');
  if (!v || v.length !== 2 || !/^\d+$/.test(v[0]) || Number(v[0]) <= Date.now() || Number(v[0]) > Date.now() + 900000 || !/^[0-9a-f]{64}$/.test(v[1])) return true;
  const k = await crypto.subtle.importKey('raw', enc.encode(user.pin_hash), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return !await crypto.subtle.verify('HMAC', k, Uint8Array.from(v[1].match(/../g)!, b => parseInt(b, 16)), enc.encode(user.id + ':' + v[0]));
}
