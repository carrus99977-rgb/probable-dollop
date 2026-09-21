import assert from 'node:assert/strict';
import { installPrivacyLifecycle, IDLE_MS } from '../lib/privacy-lifecycle.ts';
class Events {
  listeners = new Map<string, Set<(e:any)=>void>>();
  addEventListener(type:string, fn:any){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type)!.add(fn);}
  removeEventListener(type:string, fn:any){this.listeners.get(type)?.delete(fn);}
  emit(type:string, trusted=true){this.listeners.get(type)?.forEach(fn=>fn({type,isTrusted:trusted}));}
}
let clock=0, expires=0, suspends=0, activities=0;
const doc=Object.assign(new Events(),{hidden:false,documentElement:{dataset:{} as Record<string,string>}});
let tick=()=>{};
const win=Object.assign(new Events(),{setInterval:(fn:()=>void)=>{tick=fn;return 1;},clearInterval:()=>{tick=()=>{};}});
const resumes:Array<()=>void>=[];
const stop=installPrivacyLifecycle({window:win as any,document:doc as any,now:()=>clock,
  expire:()=>{expires++;},suspend:()=>{suspends++;},activity:()=>{activities++;},
  resume:()=>new Promise<void>(resolve=>resumes.push(resolve)),
});
clock=IDLE_MS-1;doc.emit('pointerdown');assert.equal(activities,1);
clock+=IDLE_MS-1;tick();assert.equal(expires,0);
doc.emit('pointerdown',false);assert.equal(activities,1,'synthetic events cannot keep session alive');
clock+=2;tick();tick();assert.equal(expires,1,'idle expires once');
win.emit('dolgi-unlocked');clock+=100;doc.emit('keydown');assert.equal(activities,2);
doc.hidden=true;doc.emit('visibilitychange');assert.equal(doc.documentElement.dataset.privateHidden,'true');assert.equal(suspends,1);
doc.emit('pointerdown');assert.equal(activities,2,'background cannot renew');
doc.hidden=false;doc.emit('visibilitychange');assert.equal(doc.documentElement.dataset.privateHidden,'true','wait for access verification');
doc.hidden=true;doc.emit('visibilitychange');resumes.shift()!();await Promise.resolve();
assert.equal(doc.documentElement.dataset.privateHidden,'true','old response cannot unmask background');
doc.hidden=false;doc.emit('visibilitychange');resumes.shift()!();await Promise.resolve();
assert.equal(doc.documentElement.dataset.privateHidden,undefined);
win.emit('pagehide');assert.equal(doc.documentElement.dataset.privateHidden,'true');
clock+=IDLE_MS;win.emit('pageshow');assert.equal(expires,2,'sleep/bfcache wall-clock expiry');resumes.shift()!();await Promise.resolve();
stop();clock+=IDLE_MS;tick();assert.equal(expires,2);
assert.ok([...doc.listeners.values()].every(s=>s.size===0));
assert.ok([...win.listeners.values()].every(s=>s.size===0));
console.log('PASS: trusted activity, idle expiry, synchronous whole-document mask, stale resume race, background/bfcache, cleanup');
