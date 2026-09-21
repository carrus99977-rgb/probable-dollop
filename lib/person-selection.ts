export type PersonSelection = { id: string; name: string };

export function selectPerson(person: PersonSelection | null): PersonSelection {
  return person ? { id: person.id, name: person.name } : { id: '', name: '' };
}

// Base UI also emits input notifications when selecting, blurring or syncing a
// controlled value. Only actual typing/clearing should invalidate selection.
export function editPersonInput(current: PersonSelection, value: string, reason: string): PersonSelection {
  if (reason !== 'input-change') return current;
  return { id: value === current.name ? current.id : '', name: value };
}
