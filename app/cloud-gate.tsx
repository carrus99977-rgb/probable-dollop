'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Download, LockKeyhole } from 'lucide-react';
import { finishOAuthCallback, supabase } from '@/lib/supabase-client';
import DebtApp from './debt-app';
type Account = { id: string; email: string };
type Legacy = { debts: number; people: number; pinEnabled: boolean; canImport: boolean };
// GitHub's Octicon mark (MIT); brand icons are not included in lucide-react.
function GithubIcon() { return <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>; }
export default function CloudGate() {
  const [user, setUser] = useState<Account | null>(null), [legacy, setLegacy] = useState<Legacy | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [pin, setPin] = useState(''), [signup, setSignup] = useState(false), [skipLegacy, setSkipLegacy] = useState(false);
  const epoch = useRef(0), signingOut = useRef(false);
  const oauthCallback = useRef<Promise<string | null> | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [resendAfter, setResendAfter] = useState(0), [clock, setClock] = useState(Date.now());
  useEffect(() => { if (!resendAfter) return; const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, [resendAfter]);
  const resendSeconds = Math.max(0, Math.ceil((resendAfter - clock) / 1000));
  // The ledger owns masking while mounted. After sign-out it is gone, so the
  // gate can safely unmask the login form, including after an expired resume.
  useEffect(() => {
    if (user && (!legacy || skipLegacy)) return;
    const hide = () => { document.documentElement.dataset.privateHidden = 'true'; };
    const visible = () => { if (document.hidden) hide(); else delete document.documentElement.dataset.privateHidden; };
    visible(); document.addEventListener('visibilitychange', visible); window.addEventListener('pagehide', hide); window.addEventListener('pageshow', visible);
    return () => { document.removeEventListener('visibilitychange', visible); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', visible); };
  }, [user, legacy, skipLegacy]);
  async function load() {
    const version = epoch.current;
    try { const r = await fetch('/api/auth', { cache: 'no-store' }), d: any = await r.json(); if (version !== epoch.current) return;
      if (!r.ok) throw Error(d.error); setUser(d.user); setLegacy(d.legacy || null); setError('');
    } catch (e) { if (version === epoch.current) setError(e instanceof Error ? e.message : 'Не удалось проверить вход'); }
    finally { if (version === epoch.current) setReady(true); }
  }
  async function signOut() {
    if (signingOut.current) return; signingOut.current = true; ++epoch.current;
    setUser(null); setLegacy(null); setPassword(''); setPin(''); setSkipLegacy(false); setReady(true); setBusy(true); setError('');
    try { sessionStorage.setItem('dolgi-reauth', '1'); } catch { /* Device-local state only. */ }
    try { const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'signout' }), keepalive: true }); if (!r.ok) throw Error(); }
    catch { setError('Нет связи. Войдите снова, когда появится интернет.'); }
    finally { signingOut.current = false; setBusy(false); }
  }
  useEffect(() => {
    let cancelled = false;
    // Reuse the same exchange during React StrictMode effect replays. Finish
    // OAuth before the old reauth flag can sign out the newly created session.
    oauthCallback.current ??= finishOAuthCallback();
    void oauthCallback.current.then(async callbackError => {
      if (cancelled) return;
      if (callbackError) { setError(callbackError); setReady(true); return; }
      let expired = false; try { expired = sessionStorage.getItem('dolgi-reauth') === '1'; } catch {}
      if (expired) await signOut(); else await load();
    });
    const close = () => { void signOut(); };
    const returned = () => { setBusy(false); setGithubBusy(false); };
    window.addEventListener('pageshow', returned);
    window.addEventListener('dolgi-auth-required', close); window.addEventListener('dolgi-signout', close);
    return () => { cancelled = true; ++epoch.current; window.removeEventListener('pageshow', returned); window.removeEventListener('dolgi-auth-required', close); window.removeEventListener('dolgi-signout', close); };
  }, []);
  async function signInWithGithub() {
    if (busy) return;
    setBusy(true); setGithubBusy(true); setError(''); setNotice('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } });
      if (error) throw error;
    } catch (error) {
      setError(error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError' ? error.message : 'Не удалось открыть GitHub. Проверьте интернет и попробуйте ещё раз.');
      setBusy(false); setGithubBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    try { const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: signup ? 'signup' : 'signin', email, password }) }), d: any = await r.json();
      if (!r.ok) throw Error(d.error); setPassword('');
      if (d.confirmation) { setNotice('Если адрес ещё не подтверждён, Supabase отправит письмо. Откройте ссылку в письме, затем вернитесь сюда и войдите. Если аккаунт уже подтверждён — просто войдите.'); setSignup(false); setResendAfter(Date.now() + 60000); setClock(Date.now()); }
      else { try { sessionStorage.removeItem('dolgi-reauth'); } catch {} await load(); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось войти'); }
    finally { setBusy(false); }
  }
  async function resend() {
    if (busy || resendSeconds) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Сначала введите корректный email.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'resend', email: email.trim() }) });
      const d: any = await r.json();
      setResendAfter(Date.now() + 60000); setClock(Date.now());
      if (!r.ok) throw Error(d.error);
      setNotice('Запрос принят. Если для этого email есть неподтверждённая регистрация, придёт новое письмо. Если вы ещё не регистрировались — нажмите «Создать аккаунт».');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось запросить письмо'); }
    finally { setBusy(false); }
  }
  async function transfer(type: 'import' | 'backup') {
    if (busy) return; setBusy(true); setError('');
    try { const r = await fetch('/api/legacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, pin }) }), d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      if (type === 'backup') { const url = URL.createObjectURL(new Blob([JSON.stringify(d.state, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'Долги-прежний-учёт.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      else { setPin(''); await load(); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось перенести данные'); }
    finally { setBusy(false); }
  }
  if (!ready) return <main className="lock-screen"><div className="logo-mark"><LockKeyhole /></div><h1>Долги</h1><p>Проверяем вход…</p></main>;
  if (user && (!legacy || skipLegacy)) return <DebtApp key={user.id} cloudEmail={user.email} />;
  if (user && legacy) return <main className="lock-screen cloud-login"><div className="logo-mark"><ArrowLeftRight /></div><h1>Ваши записи</h1><p>{user.email}</p><p>В прежнем учёте: {legacy.debts} долгов, {legacy.people} человек.</p>
    <p>{legacy.canImport ? 'Перенесём их в этот email-аккаунт вместе с возвратами, заметками и настройками. Прежняя копия сохранится.' : 'В облаке уже есть записи. Прежний учёт можно сохранить отдельным файлом — существующие данные не заменятся.'}</p>
    {legacy.pinEnabled && <label className="field"><span>PIN прежнего учёта</span><input aria-label="PIN прежнего учёта" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} /></label>}
    {error && <p className="error" role="alert">{error}</p>}
    {legacy.canImport ? <button className="primary" disabled={busy || legacy.pinEnabled && pin.length !== 6} onClick={() => transfer('import')}>{busy ? 'Переносим…' : 'Перенести мои записи'}</button> : <button className="primary" disabled={busy} onClick={() => setSkipLegacy(true)}>Открыть облачный учёт</button>}
    <button className="secondary" disabled={busy || legacy.pinEnabled && pin.length !== 6} onClick={() => transfer('backup')}><Download size={18} /> Сохранить прежнюю копию</button>
    <button className="text-button" disabled={busy} onClick={signOut}>Войти другим email</button></main>;
  return <main className="lock-screen cloud-login"><div className="logo-mark"><LockKeyhole /></div><h1>Долги</h1><p>{signup ? 'Создать личный аккаунт' : 'Войти в аккаунт'}</p>
    <button type="button" className="secondary" disabled={busy} onClick={signInWithGithub}><GithubIcon />{githubBusy ? 'Открываем GitHub…' : 'Войти через GitHub'}</button>
    <p>или по email и паролю</p>
    <form onSubmit={submit}><label className="field"><span>Email</span><input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} onBlur={() => setEmail(email.trim())} required /></label>
      <label className="field"><span>Пароль</span><input type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : 1} maxLength={256} value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Подождите…' : signup ? 'Создать аккаунт' : 'Войти'}</button>
    </form><button className="text-button" disabled={busy} onClick={() => { setSignup(!signup); setError(''); setNotice(''); }}>{signup ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт'}</button>
    {!signup && <button className="text-button" disabled={busy || !email.trim() || resendSeconds > 0} onClick={resend}>{resendSeconds > 0 ? `Повторная отправка через ${resendSeconds} с` : 'Отправить подтверждение повторно'}</button>}
    <small>Ваши записи доступны только после входа. Используйте один email на всех устройствах.</small></main>;
}
