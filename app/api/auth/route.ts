import { checkOrigin, clearAuthCookies, cloudSession, CloudError, emailSignIn, resendConfirmation, reply, rpc, supabaseRequest } from '@/lib/supabase-http';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  let cookies: string[] = [];
  try {
    const session = await cloudSession(req); cookies = session.cookies;
    const legacy = null;
    return reply({ user: { id: session.id, email: session.email }, legacy }, 200, cookies);
  } catch (e) {
    const error = e instanceof CloudError ? e : new CloudError('Не удалось проверить вход. Попробуйте ещё раз.');
    if (error.status === 401) return reply({ user: null }, 200, clearAuthCookies());
    return reply({ error: error.message }, error.status, cookies);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    if (!req.headers.get('content-type')?.includes('application/json')) throw new CloudError('Неверный формат', 400);
    const raw = await req.text(); if (raw.length > 4096) throw new CloudError('Запрос слишком большой', 413);
    const a = JSON.parse(raw);
    if (a.type === 'signout') {
      try { const session = await cloudSession(req); await supabaseRequest('/auth/v1/logout?scope=local', session.access, {}, 'POST'); } catch { /* Always remove this device's cookies. */ }
      return reply({ ok: true }, 200, clearAuthCookies());
    }
    const email = typeof a.email === 'string' ? a.email.trim() : '';
    if (!['signin', 'signup', 'resend'].includes(a.type) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new CloudError('Введите корректный email.', 400);
    if (a.type === 'resend') { await resendConfirmation(email); return reply({ confirmation: true }); }
    if (typeof a.password !== 'string' || a.password.length > 256 || a.password.length < (a.type === 'signup' ? 8 : 1)) throw new CloudError('Введите пароль. Для нового аккаунта — минимум 8 символов.', 400);
    const result = await emailSignIn(email, a.password, a.type === 'signup');
    return reply({ confirmation: result.confirmation }, 200, result.cookies);
  } catch (e) { const error = e instanceof CloudError ? e : new CloudError('Не удалось выполнить вход', 400); return reply({ error: error.message }, error.status); }
}
