import { currencies, fmt } from './model.ts';
import type { State, Debt } from './model.ts';

export type Currency = Debt['currency'];
export type Position = { currency: Currency; incoming: number; outgoing: number; net: number };
type Movement = { debtId: string; incoming: number; outgoing: number };
type Operation = {
  id: string; personId: string; currency: Currency; kind: 'debt' | 'return' | 'setoff';
  direction: Debt['direction']; date: string; createdAt: string; text: string;
  amount: number; movements: Movement[];
};
export type SettlementEvent = Operation & { before: Position; after: Position; order: number };
export type Settlements = {
  people: Map<string, Map<Currency, Position>>;
  totals: Position[];
  events: Map<string, SettlementEvent[]>;
};

const zero = (currency: Currency): Position => ({ currency, incoming: 0, outgoing: 0, net: 0 });
const chronological = (a: Operation, b: Operation) => a.date.localeCompare(b.date)
  || a.createdAt.localeCompare(b.createdAt)
  || Number(b.kind === 'debt') - Number(a.kind === 'debt')
  || a.id.localeCompare(b.id);

/** Replay every original debt, repayment and atomic setoff in operation-date order.
 * All values stay in integer minor units and in their original currency.
 * Nothing derived here is persisted or accepted as an editable balance.
 */
export function buildSettlements(s: State): Settlements {
  const debts = new Map(s.debts.map(d => [d.id, d]));
  const operations: Operation[] = s.debts.map(d => ({
    id: 'debt:' + d.id, personId: d.personId, currency: d.currency, kind: 'debt',
    direction: d.direction, date: d.date, createdAt: d.createdAt,
    text: d.comment || d.purpose, amount: d.amount,
    movements: [{ debtId: d.id, incoming: d.direction === 'in' ? d.amount : 0, outgoing: d.direction === 'out' ? d.amount : 0 }],
  }));
  const setoffs = new Map<string, Operation>();
  for (const t of s.transactions) {
    const d = debts.get(t.debtId);
    if (!d) throw new Error('Не найдена исходная запись для расчёта');
    const movement = { debtId: d.id, incoming: d.direction === 'in' ? -t.amount : 0, outgoing: d.direction === 'out' ? -t.amount : 0 };
    if (t.kind === 'return') {
      operations.push({ id: 'return:' + t.id, personId: d.personId, currency: d.currency,
        kind: 'return', direction: d.direction, date: t.date, createdAt: t.createdAt,
        text: t.comment, amount: t.amount, movements: [movement] });
      continue;
    }
    // Both sides (including allocations across several debts) form ONE event.
    let group = setoffs.get(t.groupId);
    if (!group) {
      group = { id: 'setoff:' + t.groupId, personId: d.personId, currency: d.currency,
        kind: 'setoff', direction: 'in', date: t.date, createdAt: t.createdAt,
        text: t.comment, amount: 0, movements: [] };
      setoffs.set(t.groupId, group);
    }
    if (group.personId !== d.personId || group.currency !== d.currency) throw new Error('Несовместимые стороны взаимозачёта');
    group.movements.push(movement);
    if (d.direction === 'in') group.amount += t.amount;
    if (t.date > group.date || t.date === group.date && t.createdAt > group.createdAt) {
      group.date = t.date; group.createdAt = t.createdAt;
    }
    if (t.comment && !group.text.split('\n').includes(t.comment)) group.text += (group.text ? '\n' : '') + t.comment;
  }
  operations.push(...setoffs.values());
  operations.sort(chronological);
  const people: Settlements['people'] = new Map(s.people.map(p => [p.id, new Map()]));
  const events: Settlements['events'] = new Map();
  for (const [order, op] of operations.entries()) {
    const positions = people.get(op.personId);
    if (!positions) throw new Error('Не найден человек для расчёта');
    const before = positions.get(op.currency) || zero(op.currency);
    const incoming = before.incoming + op.movements.reduce((n, m) => n + m.incoming, 0);
    const outgoing = before.outgoing + op.movements.reduce((n, m) => n + m.outgoing, 0);
    const after = { currency: op.currency, incoming, outgoing, net: incoming - outgoing };
    positions.set(op.currency, after);
    const history = events.get(op.personId) || [];
    history.push({ ...op, before, after, order });
    events.set(op.personId, history);
  }
  const totals = currencies.map(currency => {
    const total = zero(currency);
    for (const positions of people.values()) {
      const p = positions.get(currency);
      if (p) { total.incoming += p.incoming; total.outgoing += p.outgoing; }
    }
    total.net = total.incoming - total.outgoing;
    return total;
  });
  return { people, totals, events };
}

export function positionText(net: number, currency: Currency, scope: 'person' | 'all' = 'person') {
  if (!net) return 'Чистый остаток — ' + fmt(0, currency);
  if (scope === 'all') return (net > 0 ? 'В вашу пользу ' : 'В пользу других ') + fmt(Math.abs(net), currency);
  return (net > 0 ? 'Он должен вам ' : 'Вы должны ему ') + fmt(Math.abs(net), currency);
}

export function positionTone(net: number) { return net > 0 ? 'positive' : net < 0 ? 'negative' : 'settled'; }
