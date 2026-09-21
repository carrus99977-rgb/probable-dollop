import { siteIdentity } from '@/lib/access';
import { checkOrigin, CloudError, githubExchange, githubPrepare, githubVerifierCookie, reply } from '@/lib/supabase-http';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  let completing = false;
  try {
    checkOrigin(req); await siteIdentity();
    if (!req.headers.get('content-type')?.includes('application/json')) throw new CloudError('Неверный формат', 400);
    const raw = await req.text();
    if (raw.length > 4096) throw new CloudError('Запрос слишком большой', 413);
    const input = JSON.parse(raw);
    if (input.type === 'prepare') {
      return reply({ ok: true }, 200, githubPrepare(input.verifier));
    }
    if (input.type !== 'callback' || typeof input.code !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(input.code)) throw new CloudError('Неверный код входа через GitHub. Попробуйте войти ещё раз.', 400);
    completing = true;
    return reply({ ok: true }, 200, await githubExchange(req, input.code));
  } catch (e) {
    const error = e instanceof CloudError ? e : new CloudError('Не удалось войти через GitHub. Попробуйте ещё раз или используйте email и пароль.', 400);
    return reply({ error: error.message }, error.status, completing ? [githubVerifierCookie()] : []);
  }
}
