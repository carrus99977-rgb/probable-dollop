'use client';
import { ChevronRight } from 'lucide-react';
import { currencies, fmt } from '@/lib/model';
import type { State } from '@/lib/model';
import type { Settlements } from '@/lib/settlements';

export default function SettlementPeople({ state, settlements, onPerson }: {
  state: State; settlements: Settlements; onPerson: (id: string) => void;
}) {
  const groups = currencies.map(currency => ({ currency, people: state.people.flatMap(person => {
    const position = settlements.people.get(person.id)?.get(currency);
    return position && (position.incoming || position.outgoing) ? [{ ...person, ...position }] : [];
  }) })).filter(group => group.people.length);
  return <section className="settlement-people">
    <h2 className="section-title">Итоги по людям</h2>
    <p className="muted">Чистые остатки с учётом встречных долгов. Нажмите на имя, чтобы увидеть полный расчёт.</p>
    <div className="settlement-grid">{groups.map(group => <section className="balance-detail" key={group.currency} aria-label={'Итоги по людям · ' + group.currency}>
      <span className={'currency-mark ' + group.currency.toLowerCase()}>{group.currency}</span>
      {(['in', 'out', 'equal'] as const).map(direction => {
        const people = group.people.filter(p => direction === 'in' ? p.net > 0 : direction === 'out' ? p.net < 0 : p.net === 0)
          .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name, 'ru'));
        if (direction === 'equal' && !people.length) return null;
        return <div className="settlement-side" key={direction}>
          <h3>{direction === 'in' ? 'Мне должны' : direction === 'out' ? 'Я должен' : 'Встречные долги равны'}</h3>
          {!people.length && <p className="muted">Нет</p>}
          {people.map(p => <button className={'ranking settlement-person ' + (direction === 'out' ? 'negative' : direction === 'in' ? 'positive' : 'settled')} key={p.id} onClick={() => onPerson(p.id)}>
            <span>{p.name}{direction === 'equal' && <small>По {fmt(p.incoming, group.currency)} в обе стороны</small>}</span>
            <b>{fmt(Math.abs(p.net), group.currency)}</b><ChevronRight size={17} />
          </button>)}
        </div>;
      })}
    </section>)}</div>
    {!groups.length && <p className="muted">Незакрытых расчётов нет.</p>}
  </section>;
}
