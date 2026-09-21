import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {empty,seed,act,remaining,today} from '../lib/model.ts';
const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('drizzle/0000_massive_jack_power.sql','utf8'));
class Statement{constructor(sql){this.sql=sql;this.args=[]}bind(...args){this.args=args;return this}async run(){const st=sqlite.prepare(this.sql);if(/^SELECT/.test(this.sql))return {results:st.all(...this.args),meta:{changes:0}};const result=st.run(...this.args);return {results:[],meta:{changes:Number(result.changes)}}}}
const fake={prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
let source=fs.readFileSync('lib/storage.ts','utf8').replace("import { env } from 'cloudflare:workers';",'const env = {DB: arguments[0]};').replace("import { empty,State,validate,uid } from './model';",'const {empty,validate,uid}=arguments[1];').replaceAll('export ','');
const compiled=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
const model=await import('../lib/model.ts');
const storage=Function(compiled+';return {read,write};')(fake,model);
for(const id of ['alice','bob'])sqlite.prepare('INSERT INTO users(id) VALUES (?)').run(id);
const blank=empty();blank.categories=[];
await storage.write('alice',0,blank,seed());await storage.write('bob',0,blank,seed());
const first=await storage.read('alice');assert.equal(first.state.debts.length,6);
const next=act(first.state,{type:'return',id:'d2',amount:'1000',date:today()});
assert.equal(await storage.write('alice',1,first.state,next),2);
await assert.rejects(()=>storage.write('alice',1,first.state,act(first.state,{type:'return',id:'d2',amount:'2000'})));
const readBack=await storage.read('alice');assert.equal(remaining(readBack.state,readBack.state.debts.find(d=>d.id==='d2')),4400000);
const bob=await storage.read('bob');assert.equal(remaining(bob.state,bob.state.debts.find(d=>d.id==='d2')),4500000);
const setoff=act(readBack.state,{type:'setoff',personId:'p0',currency:'USD',date:today()});await storage.write('alice',2,readBack.state,setoff);
const afterOffset=await storage.read('alice');assert.equal(remaining(afterOffset.state,afterOffset.state.debts.find(d=>d.id==='d0')),2000000);
const clear=act(afterOffset.state,{type:'clear'});await storage.write('alice',3,afterOffset.state,clear);assert.equal((await storage.read('alice')).state.debts.length,0);assert.equal((await storage.read('bob')).state.debts.length,6);
await storage.write('alice',4,clear,act(clear,{type:'restore',data:setoff}));assert.equal((await storage.read('alice')).state.transactions.length,setoff.transactions.length);
console.log('PASS: actual SQLite migrations, writes, read-back, user isolation, stale revision rejection, setoff, clear, restore');
// Cloud API security regression coverage lives in tests/cloud-api.mjs.
