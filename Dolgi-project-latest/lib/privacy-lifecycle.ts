export const IDLE_MS = 15 * 60 * 1000;

// Only activity timestamps are device-local. No ledger content is persisted.
export function installPrivacyLifecycle(options: {
  window: Window; document: Document; now?: () => number;
  expire: () => void; suspend: () => void; resume: () => Promise<void>;
  activity: () => void;
}) {
  const { window: win, document: doc } = options;
  const now = options.now || Date.now;
  let last = now(), expired = false, generation = 0, stopped = false;
  let suspended = doc.hidden;
  const mask = () => { doc.documentElement.dataset.privateHidden = 'true'; };
  const expire = () => { if (expired) return; expired = true; options.expire(); };
  const check = () => { if (now() - last >= IDLE_MS) expire(); };
  const activity = (event: Event) => {
    if (!event.isTrusted || doc.hidden || suspended) return;
    check();
    if (expired) return;
    last = now(); options.activity();
  };
  const suspend = () => {
    mask(); ++generation;
    if (!suspended) { suspended = true; options.suspend(); }
  };
  const resume = async () => {
    if (doc.hidden) return;
    const current = ++generation;
    mask(); check();
    try { await options.resume(); }
    finally {
      if (!stopped && current === generation && !doc.hidden) {
        suspended = false; delete doc.documentElement.dataset.privateHidden;
      }
    }
  };
  const visibility = () => { if (doc.hidden) suspend(); else void resume(); };
  const pageShow = () => { void resume(); };
  const reset = () => { last = now(); expired = false; };
  const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'input'];
  events.forEach(type => doc.addEventListener(type, activity, { passive: true, capture: true }));
  doc.addEventListener('visibilitychange', visibility);
  win.addEventListener('pagehide', suspend);
  win.addEventListener('pageshow', pageShow);
  win.addEventListener('dolgi-unlocked', reset);
  const timer = win.setInterval(check, 1000);
  if (doc.hidden) { mask(); options.suspend(); }
  return () => {
    stopped = true; ++generation; win.clearInterval(timer);
    events.forEach(type => doc.removeEventListener(type, activity, true));
    doc.removeEventListener('visibilitychange', visibility);
    win.removeEventListener('pagehide', suspend); win.removeEventListener('pageshow', pageShow);
    win.removeEventListener('dolgi-unlocked', reset);
  };
}
