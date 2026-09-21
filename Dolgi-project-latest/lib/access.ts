import { getChatGPTUser } from '@/app/chatgpt-auth';
import { CloudError } from './supabase-http';
export async function siteIdentity() {
  const user = await getChatGPTUser();
  if (user) return user.userId;
  if (process.env.NODE_ENV === 'development') return 'local-development';
  throw new CloudError('Войдите в ChatGPT для доступа к приложению', 401);
}
