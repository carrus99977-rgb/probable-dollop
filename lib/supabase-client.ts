import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.ts';

// The official SDK owns OAuth URL creation and browser navigation. Its custom
// storage saves only the PKCE verifier in our existing HttpOnly cookie flow.
// Session exchange, refresh, logout and ledger requests remain server-owned.
async function authRequest(body: unknown) {
  const response = await fetch('/api/auth/github', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || 'Не удалось войти через GitHub. Попробуйте ещё раз или используйте email и пароль.');
  return data;
}
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    flowType: 'pkce', detectSessionInUrl: false, autoRefreshToken: false,
    persistSession: true, storageKey: 'dolgi-github',
    storage: {
      getItem: async () => null,
      setItem: async (key, value) => {
        if (key === 'dolgi-github-code-verifier') await authRequest({ type: 'prepare', verifier: value });
      },
      removeItem: async () => {},
    },
  },
});
export async function finishOAuthCallback(): Promise<string | null> {
  const url = new URL(window.location.href), hash = new URLSearchParams(url.hash.slice(1));
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error') || hash.get('error');
  const hasError = error || url.searchParams.has('error_description') || hash.has('error_description');
  if (!code && !hasError) return null;
  // Remove callback material before other requests/rendering. Never show provider
  // descriptions verbatim or leave one-time codes in browser history.
  for (const key of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  if (hasError) url.hash = '';
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  if (hasError) return error === 'access_denied'
    ? 'Вход через GitHub отменён или доступ не разрешён. Попробуйте ещё раз или войдите по email и паролю.'
    : 'GitHub не смог завершить вход. Попробуйте ещё раз или войдите по email и паролю.';
  try {
    await authRequest({ type: 'callback', code });
    try { sessionStorage.removeItem('dolgi-reauth'); } catch { /* Device preference only. */ }
    return null;
  } catch (cause) {
    return cause instanceof Error && cause.name !== 'TimeoutError' && cause.name !== 'TypeError'
      ? cause.message : 'Нет связи. Не удалось завершить вход через GitHub. Попробуйте ещё раз.';
  }
}
