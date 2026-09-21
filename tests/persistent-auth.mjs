import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as http from '../lib/supabase-http.ts';
const source=fs.readFileSync('app/api/auth/route.ts','utf8')
  .replace("import { siteIdentity } from '@/lib/access';",'const siteIdentity=async()=>"site-owner";')
  .replace(/import \{[^\n]+\} from '@\/lib\/supabase-http';/,'const {checkOrigin,clearAuthCookies,cloudSession,CloudError,emailSignIn,resendConfirmation,reply,rpc,supabaseRequest}=arguments[0];')
  .replace("import { legacyInfo } from '@/lib/legacy';",'const legacyInfo=async()=>null;').replaceAll('export ','');
const api=Function(ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None})+';return {GET,POST};')(http);
const originalFetch=globalThis.fetch, originalNow=Date.now;
const user={id:'remembered-owner',email:'test@example.invalid',email_confirmed_at:'2026-01-01',is_anonymous:false};
let refreshes=0, revoked=false;
try {
  globalThis.fetch=async(url,options)=>{
    const path=String(url);
    if(path.includes('grant_type=password'))return Response.json({access_token:'old-access',refresh_token:'old-refresh'});
    if(path.endsWith('/auth/v1/user'))return new Headers(options?.headers).get('Authorization')==='Bearer new-access'?Response.json(user):Response.json({}, {status:401});
    if(path.includes('grant_type=refresh_token')){refreshes++;return Response.json({access_token:'new-access',refresh_token:'new-refresh'});}
    if(path.endsWith('/rpc/dolgi_read'))return Response.json({state:{},user:{id:user.id,pin_hash:null}});
    if(path.includes('/auth/v1/logout')){revoked=true;return Response.json({});}
    throw Error('Unexpected request');
  };
  const login=await http.emailSignIn(user.email,'test-password',false);
  const cookies=login.cookies.filter(c=>!c.startsWith('dolgi_active=')).map(c=>c.split(';')[0]).join('; ');
  const now=originalNow();Date.now=()=>now+7*86400000;
  const r=await api.GET(new Request('https://app.test/api/auth',{headers:{cookie:cookies}}));
  assert.equal(r.status,200);assert.equal((await r.json()).user.id,user.id);assert.equal(refreshes,1);
  assert.match(r.headers.get('set-cookie'),/dolgi_sb_refresh=new-refresh/);
  const saved='dolgi_sb_access=new-access; dolgi_sb_refresh=new-refresh';
  const logout=await api.POST(new Request('https://app.test/api/auth',{method:'POST',headers:{'content-type':'application/json',cookie:saved},body:JSON.stringify({type:'signout'})}));
  assert.equal(logout.status,200);assert.ok(revoked);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await (await api.GET(new Request('https://app.test/api/auth'))).json()).user,null);
  globalThis.fetch=async()=>{throw Error('offline');};
  const offline=await api.GET(new Request('https://app.test/api/auth',{headers:{cookie:saved}}));
  assert.equal(offline.status,503);assert.equal(offline.headers.get('set-cookie'),null);
  console.log('PASS: email login, reopen after seven days, refresh rotation, explicit logout, offline cookie preservation');
} finally {globalThis.fetch=originalFetch;Date.now=originalNow;}
