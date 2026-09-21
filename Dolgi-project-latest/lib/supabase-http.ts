// Public project settings only. No service_role, database password or JWT signing secret.
import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.ts';
export { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.ts';
export class CloudError extends Error { status: number; constructor(message: string, status = 503) { super(message); this.status = status; } }
export type CloudSession = { id: string; email: string; access: string; cookies: string[]; activeUntil: number };
const secure = () => process.env.NODE_ENV === 'production' ? '; Secure' : '';
const cookie = (name: string, value: string, age: number) => `${name}=${encodeURIComponent(value)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${age}${secure()}`;
export const clearAuthCookies = () => [cookie('dolgi_sb_access', '', 0), cookie('dolgi_sb_refresh', '', 0), 'dolgi_lock=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + secure(), cookie('dolgi_active', '', 0)];
async function activitySignature(access: string, expiry: number) {
  const enc = new TextEncoder(), key = await crypto.subtle.importKey('raw', enc.encode(access), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(String(expiry))))).map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function renewActivity(session: Pick<CloudSession, 'access'>, expiry = Date.now() + 900000) { return cookie('dolgi_active', expiry + '.' + await activitySignature(session.access, expiry), 900); }
async function activeUntil(access: string, value: string) {
  const [expiry, signature] = value.split('.'); const time = Number(expiry);
  if (!access || !/^\d+$/.test(expiry || '') || time <= Date.now() || time > Date.now() + 900000 || !/^[0-9a-f]{64}$/.test(signature || '')) return 0;
  return signature === await activitySignature(access, time) ? time : 0;
}
async function tokenCookies(data: any, activityExpiry = Date.now() + 900000) {
  if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') throw new CloudError('Не удалось открыть сеанс', 401);
  return [cookie('dolgi_sb_access', data.access_token, 365 * 24 * 3600), cookie('dolgi_sb_refresh', data.refresh_token, 365 * 24 * 3600), ...(activityExpiry > Date.now() ? [await renewActivity({ access: data.access_token }, activityExpiry)] : [])];
}
export async function supabaseRequest(path: string, access?: string, body?: unknown, method?: string) {
  let r: Response;
  try { r = await fetch(SUPABASE_URL + path, { method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { apikey: SUPABASE_KEY, ...(access ? { Authorization: 'Bearer ' + access } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(20000) }); }
  catch { throw new CloudError('Нет связи с облаком. Попробуйте ещё раз.'); }
  const data: any = await r.json().catch(() => null);
  return { r, data };
}
const fromUser = (data: any, access: string, cookies: string[], activeUntil: number): CloudSession => {
  if (!data?.id || !data?.email || !data.email_confirmed_at || data.is_anonymous) throw new CloudError('Подтвердите email и войдите снова', 401);
  return { id: data.id, email: data.email, access, cookies, activeUntil };
};
export async function cloudSession(req: Request): Promise<CloudSession> {
  const cookies = Object.fromEntries((req.headers.get('cookie') || '').split(';').map(v => v.trim().split(/=(.*)/)).filter(v => v.length >= 2));
  let access = '', refresh = '';
  try { access = decodeURIComponent(cookies.dolgi_sb_access || ''); refresh = decodeURIComponent(cookies.dolgi_sb_refresh || ''); } catch { throw new CloudError('Войдите в аккаунт', 401); }
  const activity = await activeUntil(access, cookies.dolgi_active || '');
  if (access) {
    const { r, data } = await supabaseRequest('/auth/v1/user', access);
    if (r.ok) return fromUser(data, access, [], activity);
    if (r.status >= 500) throw new CloudError('Не удалось проверить вход. Попробуйте ещё раз.');
  }
  if (!refresh) throw new CloudError('Войдите в аккаунт', 401);
  const { r, data } = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', undefined, { refresh_token: refresh });
  if (!r.ok) throw new CloudError(r.status >= 500 ? 'Не удалось проверить вход' : 'Сеанс завершён. Войдите снова', r.status >= 500 ? 503 : 401);
  const updated = await tokenCookies(data, activity);
  // Authenticate against Auth, never trust a locally decoded JWT or client-supplied user ID.
  const checked = await supabaseRequest('/auth/v1/user', data.access_token);
  if (!checked.r.ok) throw new CloudError('Не удалось проверить вход', checked.r.status >= 500 ? 503 : 401);
  return fromUser(checked.data, data.access_token, updated, activity);
}
export async function emailSignIn(email: string, password: string, signup: boolean) {
  const { r, data } = await supabaseRequest(signup ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', undefined, { email, password });
  if (!r.ok) throw emailAuthError(r.status, data, signup ? 'signup' : 'signin');
  if (!data?.access_token) return { confirmation: true, cookies: [] };
  return { confirmation: false, cookies: await tokenCookies(data) };
}
// Extend the existing HTTP Auth client: OAuth uses the same verified session,
// HttpOnly cookies, automatic refresh and RLS-backed data requests as email.
export const githubVerifierCookie = (value = '') => `dolgi_github_verifier=${value}; Path=/api/auth/github; HttpOnly; SameSite=Lax; Max-Age=${value ? 600 : 0}${secure()}`;
export function githubPrepare(storedVerifier: unknown) {
  // Supabase's storage adapter receives a JSON-encoded verifier. Preserve it
  // in the existing server cookie before the SDK navigates to Supabase Auth.
  if (typeof storedVerifier !== 'string' || storedVerifier.length > 256) throw new CloudError('Не удалось подготовить вход через GitHub', 400);
  let verifier: unknown;
  try { verifier = JSON.parse(storedVerifier); } catch { throw new CloudError('Неверный формат входа через GitHub', 400); }
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new CloudError('Неверный формат входа через GitHub', 400);
  return [githubVerifierCookie(verifier)];
}
export async function githubExchange(req: Request, code: string) {
  const verifier = (req.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith('dolgi_github_verifier='))?.slice('dolgi_github_verifier='.length) || '';
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new CloudError('Попытка входа через GitHub истекла. Нажмите «Войти через GitHub» ещё раз в этом браузере.', 400);
  const { r, data } = await supabaseRequest('/auth/v1/token?grant_type=pkce', undefined, { auth_code: code, code_verifier: verifier });
  if (!r.ok || !data?.access_token || !data?.refresh_token) throw new CloudError('Не удалось завершить вход через GitHub. Нажмите «Войти через GitHub» ещё раз или войдите по email и паролю.', r.status >= 500 ? 503 : 400);
  const checked = await supabaseRequest('/auth/v1/user', data.access_token);
  if (!checked.r.ok) throw new CloudError('Не удалось проверить вход через GitHub. Попробуйте ещё раз.', 503);
  fromUser(checked.data, data.access_token, [], 0);
  return [...await tokenCookies(data), clearAuthCookies()[2], githubVerifierCookie()];
}
// Only a bounded provider code is logged; never email, password, response body or tokens.
function emailAuthError(status: number, data: any, action: string) {
  // Older Auth responses put the HTTP number in `code` and the reason in `error_code`.
  const code = [data?.error_code, data?.code].find(value => typeof value === 'string' && /^[a-z_]{1,80}$/.test(value)) || 'unknown';
  console.error('dolgi_email_auth', JSON.stringify({ action, status, code }));
  const messages: Record<string, string> = {
    email_address_not_authorized: 'Supabase пока не разрешает отправлять письма на этот адрес. Нужно настроить SMTP в проекте Supabase. Повторная регистрация это не исправит.',
    over_email_send_rate_limit: 'Исчерпан лимит отправки писем Supabase. Подождите час перед повторной отправкой. Для стабильной доставки нужно настроить SMTP.',
    over_request_rate_limit: 'Слишком много попыток. Подождите несколько минут.',
    email_not_confirmed: 'Email ещё не подтверждён. Откройте письмо или нажмите «Отправить подтверждение повторно».',
    email_address_invalid: 'Supabase не принимает этот email. Проверьте адрес и опечатки.',
    weak_password: 'Пароль не соответствует требованиям Supabase. Используйте длинный пароль с буквами, цифрами и символами.',
    signup_disabled: 'Регистрация отключена в настройках Supabase.',
    email_provider_disabled: 'Вход по email отключён в настройках Supabase.',
    user_already_exists: 'Не удалось создать аккаунт. Если вы уже регистрировались, нажмите «Войти».',
    invalid_credentials: 'Не удалось войти. Проверьте email и пароль. Если аккаунта ещё нет — нажмите «Создать аккаунт».',
    unexpected_failure: 'Supabase не смог завершить запрос. Нужно проверить журнал Authentication и настройки отправки писем.',
    captcha_failed: 'Supabase требует проверку CAPTCHA. Нужно согласовать её настройку с формой входа.',
  };
  const message = messages[code] || (status === 429 ? 'Слишком много попыток. Попробуйте позже.' : 'Supabase отклонил запрос. Передайте код ошибки для проверки.');
  return new CloudError(`${message} (Код: ${code}, ${status})`, status === 429 ? 429 : status >= 500 ? 503 : 400);
}
export async function resendConfirmation(email: string) {
  const { r, data } = await supabaseRequest('/auth/v1/resend', undefined, { type: 'signup', email });
  if (!r.ok) throw emailAuthError(r.status, data, 'resend');
  // Success is deliberately neutral: Auth must not reveal whether an email exists.
}
export async function rpc(session: CloudSession, name: string, body: unknown = {}) {
  const { r, data } = await supabaseRequest('/rest/v1/rpc/' + name, session.access, body);
  if (!r.ok) throw new CloudError(data?.code === '40001' ? 'Данные обновились на другом устройстве. Обновите экран и повторите.' : 'Не удалось сохранить или загрузить данные. Попробуйте ещё раз.', data?.code === '40001' ? 409 : r.status === 401 ? 401 : 503);
  return data;
}
export function reply(value: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, oai-authenticated-user-id', 'X-Content-Type-Options': 'nosniff' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(value), { status, headers });
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (req.headers.get('sec-fetch-site') === 'cross-site' || origin && origin !== new URL(req.url).origin) throw new CloudError('Запрос отклонён', 403);
}
