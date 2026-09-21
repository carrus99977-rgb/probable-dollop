import CloudGate from './cloud-gate';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
async function ProtectedApp(){
  const user = await requireChatGPTUser('/');
  return <CloudGate key={user.userId}/>;
}
export default function Page(){
  return process.env.NODE_ENV === 'development' ? <CloudGate/> : <ProtectedApp/>;
}
