import assert from 'node:assert/strict';
import {act,seed,remaining,today,validate} from '../lib/model.ts';

let original=seed();
original=act(original,{type:'note',id:'d2',text:'Debt note'});
original=act(original,{type:'note',personId:'p1',text:'Keep person note'});
original.reminders.push({id:'test-reminder',debtId:'d2',days:1});
const snapshot=structuredClone(original);
const result=act(original,{type:'deleteDebt',id:'d2'});
assert.ok(!result.debts.some(d=>d.id==='d2'));
assert.ok(!result.transactions.some(t=>t.debtId==='d2'));
assert.ok(!result.notes.some(n=>n.debtId==='d2'));
assert.ok(!result.reminders.some(r=>r.debtId==='d2'));
assert.ok(result.notes.some(n=>n.text==='Keep person note'));
assert.deepEqual(result.people,original.people);
assert.deepEqual(result.debts,original.debts.filter(d=>d.id!=='d2'));
assert.deepEqual(original,snapshot);
assert.throws(()=>act(result,{type:'deleteDebt',id:'d2'}),/уже удалена/);

// Removing a closed debt erases its repayment instead of manufacturing another payment.
const closed=act(seed(),{type:'deleteDebt',id:'d5'});
assert.ok(!closed.debts.some(d=>d.id==='d5'));
assert.ok(!closed.transactions.some(t=>t.debtId==='d5'));

// Two linked setoff groups are undone on both sides, retaining unrelated repayments.
const offset=act(seed(),{type:'setoff',personId:'p0',currency:'USD',date:today()});
const deleted=act(offset,{type:'deleteDebt',id:'d0'});
validate(deleted);
assert.equal(remaining(deleted,deleted.debts.find(d=>d.id==='d1')!),3000000);
assert.ok(!deleted.transactions.some(t=>t.kind==='setoff'));
assert.deepEqual(deleted.transactions,offset.transactions.filter(t=>t.kind==='return'));
assert.deepEqual(act(deleted,{type:'restore',data:JSON.parse(JSON.stringify(deleted))}),deleted);
console.log('PASS: deletion of open/closed debts, related records, paired setoffs, preserved records, and reload validation');
