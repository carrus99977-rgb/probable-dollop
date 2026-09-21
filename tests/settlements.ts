import assert from 'node:assert/strict';
import { empty, seed, validate, remaining } from '../lib/model.ts';
import type { State, Debt } from '../lib/model.ts';
import { buildSettlements, positionText } from '../lib/settlements.ts';

const s = empty();
s.people = [{ id: 'p', name: 'Магомед' }, { id: 'q', name: 'Аслан' }];
const debt = (id: string, personId: string, direction: Debt['direction'], amount: number, currency: Debt['currency'], date: string) => {
  s.debts.push({ id, personId, direction, amount: amount * 100, currency, date, due: '', purpose: '', comment: '', categoryId: 'cat0', tags: [], createdAt: date + 'T10:00:00Z' });
};
const tx = (id: string, debtId: string, amount: number, date: string, kind: 'return' | 'setoff' = 'return', groupId = id) => {
  s.transactions.push({ id, debtId, amount: amount * 100, date, kind, groupId, comment: '', createdAt: date + 'T12:00:00Z' });
};
debt('borrowed', 'p', 'out', 50000, 'USD', '2026-01-01');
debt('lent1', 'p', 'in', 20000, 'USD', '2026-01-02');
debt('lent2', 'p', 'in', 10000, 'USD', '2026-01-03');
tx('my-return', 'borrowed', 5000, '2026-01-04');
tx('his-return', 'lent1', 3000, '2026-01-05');
tx('offset-out', 'borrowed', 20000, '2026-01-06', 'setoff', 'offset');
tx('offset-in1', 'lent1', 17000, '2026-01-06', 'setoff', 'offset');
tx('offset-in2', 'lent2', 3000, '2026-01-06', 'setoff', 'offset');
tx('my-second-return', 'borrowed', 20000, '2026-01-07');
debt('other-person', 'q', 'in', 12000, 'USD', '2026-01-01');
debt('eur-in', 'p', 'in', 20000, 'EUR', '2026-01-01');
debt('eur-out', 'p', 'out', 3000, 'EUR', '2026-01-02');
debt('usdt-out', 'p', 'out', 2000, 'USDT', '2026-01-02');
// Intentionally inserted last: operation date, not array position or entry time, governs history.
debt('earlier-rub', 'p', 'in', 100, 'RUB', '2025-12-31');
s.debts.at(-1)!.createdAt = '2026-02-01T10:00:00Z';
s.notes.push({ id: 'note', debtId: '', personId: 'p', kind: 'note', text: 'Не денежная операция', date: '2026-01-06', createdAt: '2026-01-06T10:00:00Z' });
validate(s);
const snapshot = JSON.stringify(s);
const result = buildSettlements(s);
assert.equal(JSON.stringify(s), snapshot, 'Calculation must not mutate the saved history');
const history = result.events.get('p')!.filter(e => e.currency === 'USD');
assert.deepEqual(history.map(e => [e.before.net / 100, e.after.net / 100]), [
  [0, -50000], [-50000, -30000], [-30000, -20000], [-20000, -15000],
  [-15000, -18000], [-18000, -18000], [-18000, 2000],
]);
const offset = history.find(e => e.kind === 'setoff')!;
assert.equal(offset.amount, 20000 * 100, 'Setoff is counted once, never twice');
assert.equal(offset.movements.length, 3, 'All debt allocations are retained');
assert.deepEqual([offset.after.incoming, offset.after.outgoing], [7000 * 100, 25000 * 100]);
assert.deepEqual(result.people.get('p')!.get('USD'), { currency: 'USD', incoming: 700000, outgoing: 500000, net: 200000 });
assert.equal(result.people.get('p')!.get('EUR')!.net, 17000 * 100);
assert.equal(result.people.get('p')!.get('USDT')!.net, -2000 * 100);
assert.equal(result.totals.find(p => p.currency === 'USD')!.net, 14000 * 100);
assert.equal(result.events.get('p')![0].id, 'debt:earlier-rub');
assert.match(positionText(-1800000, 'USD'), /^Вы должны ему /);
assert.match(positionText(200000, 'USD'), /^Он должен вам /);

// Reload / backup / differing database row order must reproduce the same running balances.
const restored = validate(JSON.parse(snapshot));
restored.debts.reverse(); restored.transactions.reverse();
const rebuilt = buildSettlements(restored);
assert.deepEqual(rebuilt.totals, result.totals);
assert.deepEqual(rebuilt.events.get('p')!.map(e => [e.id, e.before, e.after]), result.events.get('p')!.map(e => [e.id, e.before, e.after]));

tx('his-close', 'lent2', 7000, '2026-01-08');
tx('my-close', 'borrowed', 5000, '2026-01-09');
const closed = buildSettlements(validate(s));
assert.deepEqual(closed.people.get('p')!.get('USD'), { currency: 'USD', incoming: 0, outgoing: 0, net: 0 });
assert.deepEqual(closed.events.get('p')!.filter(e => e.currency === 'USD').slice(-2).map(e => e.after.net), [-500000, 0]);

// Same-day / same-timestamp records and fractional money must retain a deterministic order.
const cents = empty(); cents.people = [{ id: 'p', name: 'Тест' }];
cents.debts = [{ ...s.debts[0], id: 'cents', direction: 'in', currency: 'RUB', amount: 30 }];
cents.transactions = [{ ...s.transactions[0], id: 'cents-return', debtId: 'cents', amount: 30, date: cents.debts[0].date, createdAt: cents.debts[0].createdAt }];
const centsResult = buildSettlements(validate(cents));
assert.deepEqual(centsResult.events.get('p')!.map(e => e.after.net), [30, 0]);

// Reconcile every currency and person against the existing per-debt balances, including closed debts.
for (const state of [s, seed(), cents, empty()] as State[]) {
  const ledger = buildSettlements(state);
  for (const p of state.people) for (const total of ledger.totals) {
    const ds = state.debts.filter(d => d.personId === p.id && d.currency === total.currency);
    const incoming = ds.filter(d => d.direction === 'in').reduce((n, d) => n + remaining(state, d), 0);
    const outgoing = ds.filter(d => d.direction === 'out').reduce((n, d) => n + remaining(state, d), 0);
    const position = ledger.people.get(p.id)?.get(total.currency);
    assert.equal(position?.incoming || 0, incoming);
    assert.equal(position?.outgoing || 0, outgoing);
    assert.equal(position?.net || 0, incoming - outgoing);
  }
}
console.log('PASS: per-person/currency totals, running positions, atomic allocated setoff, returns in both directions, sign changes, closing, backdating, same-day order and restore');
