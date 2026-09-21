import { type Debt, type State, fmt, remaining } from './model.ts';

export function receiptData(s: State, d: Debt, issuedAt = new Date().toISOString()) {
  const name = s.people.find(p => p.id === d.personId)?.name || 'Человек';
  const returned = s.transactions.filter(t => t.debtId === d.id && t.kind === 'return').reduce((n, t) => n + t.amount, 0);
  const offset = s.transactions.filter(t => t.debtId === d.id && t.kind === 'setoff').reduce((n, t) => n + t.amount, 0);
  return {
    id: d.id, name, currency: d.currency, issuedAt, createdAt: d.createdAt,
    direction: d.direction === 'in' ? `${name} должен автору записи` : `Автор записи должен: ${name}`,
    date: fullDate(d.date), due: d.due ? fullDate(d.due) : 'Без срока',
    principal: fmt(d.amount, d.currency), returned: fmt(returned, d.currency),
    offset: fmt(offset, d.currency), balance: fmt(remaining(s, d), d.currency),
    purpose: d.purpose || 'Не указано', comment: d.comment,
  };
}
export type ReceiptData = ReturnType<typeof receiptData>;
export function fullDate(date: string) {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function wrapReceiptText(text: string, width: number, measure: (s: string) => number): string[] {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? line + ' ' + word : word;
      if (measure(candidate) <= width) { line = candidate; continue; }
      if (line) result.push(line);
      line = '';
      // Long words/URLs must not be clipped or dropped.
      for (const char of Array.from(word)) {
        if (line && measure(line + char) > width) { result.push(line); line = ''; }
        line += char;
      }
    }
    result.push(line);
  }
  return result;
}

type Block = { kind: 'text' | 'rule' | 'balance' | 'pair' | 'space'; text: string; size: number; weight: number; height: number; color: string; label?: string; lines?: string[] };
export async function renderReceipt(data: ReceiptData): Promise<{ file: File; url: string }[]> {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Не удалось создать изображение чека');
  const font = (size: number, weight = 400) => `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const blocks: Block[] = [];
  const add = (value: string, size = 28, weight = 400, color = '#303d36') => {
    ctx.font = font(size, weight);
    for (const line of wrapReceiptText(value, 724, s => ctx.measureText(s).width)) blocks.push({ kind: 'text', text: line, size, weight, height: Math.ceil(size * 1.45), color });
  };
  const rule = () => blocks.push({ kind: 'rule', text: '', size: 0, weight: 400, height: 40, color: '' });
  const space = (height = 20) => blocks.push({ kind: 'space', text: '', size: 0, weight: 400, height, color: '' });
  const pair = (label: string, value: string, size = 29) => {
    ctx.font = font(size, 500);
    const lines = wrapReceiptText(value, 405, s => ctx.measureText(s).width);
    blocks.push({ kind: 'pair', label, lines, text: value, size, weight: 500, height: Math.max(48, lines.length * Math.ceil(size * 1.4) + 10), color: '#303d36' });
  };
  add(data.name, 50, 600); add(data.direction, 26, 400, '#717b74'); rule();
  pair('Дата операции', data.date, 27); pair('Срок возврата', data.due, 27); space();
  add('НАЗНАЧЕНИЕ', 21, 500, '#778078'); space(6); add(data.purpose, 30); rule();
  pair('Первоначально', data.principal, 31);
  pair('Возвращено', data.returned, 31); pair('Взаимозачёт', data.offset, 31); space(20);
  blocks.push({ kind: 'balance', text: data.balance, size: 76, weight: 600, height: 214, color: '#294b3b' });
  if (data.comment) { space(24); add('КОММЕНТАРИЙ', 21, 500, '#778078'); space(6); add(data.comment, 27); }

  // Paginate exceptionally long notes instead of exceeding iOS canvas limits.
  const pages: Block[][] = [[]]; let pageHeight = 0;
  for (const block of blocks) {
    if (pageHeight + block.height > 1720 && pages.at(-1)!.length) { pages.push([]); pageHeight = 0; }
    pages.at(-1)!.push(block); pageHeight += block.height;
  }
  const images: { file: File; url: string }[] = [];
  try {
    for (let index = 0; index < pages.length; index++) {
      const bodyHeight = pages[index].reduce((n, b) => n + b.height, 0);
      canvas.height = 262 + bodyHeight + 232;
      const rounded = (x: number, y: number, width: number, height: number, radius: number, color: string) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
      };
      ctx.fillStyle = '#e9ede8'; ctx.fillRect(0, 0, 900, canvas.height);
      rounded(24, 24, 852, canvas.height - 48, 36, '#fffefa');
      ctx.strokeStyle = '#d9dfd6'; ctx.lineWidth = 1; ctx.stroke();
      ctx.textBaseline = 'top'; ctx.textAlign = 'center'; ctx.fillStyle = '#7c857d';
      ctx.font = 'italic 25px Georgia, serif'; ctx.fillText('Слово дороже расписки', 450, 68);
      ctx.textAlign = 'left'; ctx.fillStyle = '#34453b'; ctx.font = font(43, 650);
      ctx.fillText('ЧЕК ДОЛГА', 78, 144);
      ctx.font = font(23, 500); ctx.textAlign = 'right'; ctx.fillStyle = '#778078';
      ctx.fillText(index ? `${data.currency} · ${index + 1} / ${pages.length}` : data.currency, 822, 160);
      ctx.textAlign = 'left'; ctx.strokeStyle = '#dfe3da'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(78, 220); ctx.lineTo(822, 220); ctx.stroke();
      let y = 258;
      for (const block of pages[index]) {
        if (block.kind === 'rule') {
          ctx.strokeStyle = '#dfe3da'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(78, y + 18); ctx.lineTo(822, y + 18); ctx.stroke();
        } else if (block.kind === 'balance') {
          rounded(60, y, 780, 204, 24, '#edf2e9');
          ctx.fillStyle = '#6e7c70'; ctx.font = font(23, 500); ctx.fillText('ТЕКУЩИЙ ОСТАТОК', 92, y + 33);
          ctx.fillStyle = '#294b3b'; let size = 76; ctx.font = font(size, 600);
          while (ctx.measureText(block.text).width > 708 && size > 28) ctx.font = font(--size, 600);
          ctx.fillText(block.text, 88, y + 86);
        } else if (block.kind === 'pair') {
          ctx.fillStyle = '#778078'; ctx.font = font(26); ctx.fillText(block.label!, 78, y + 3);
          ctx.fillStyle = block.color; ctx.font = font(block.size, block.weight); ctx.textAlign = 'right';
          block.lines!.forEach((line, i) => ctx.fillText(line, 822, y + i * Math.ceil(block.size * 1.4)));
          ctx.textAlign = 'left';
        } else if (block.kind === 'text') {
          ctx.font = font(block.size, block.weight); ctx.fillStyle = block.color; ctx.fillText(block.text, 78, y);
        }
        y += block.height;
      }
      y += 24; ctx.strokeStyle = '#dfe3da'; ctx.beginPath(); ctx.moveTo(78, y); ctx.lineTo(822, y); ctx.stroke();
      y += 24; ctx.fillStyle = '#778078'; ctx.font = font(20);
      const dateTime = (value: string) => new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      ctx.fillText('Запись № ' + data.id.slice(0, 12).toUpperCase() + (pages.length > 1 ? ` · ${index + 1} / ${pages.length}` : ''), 78, y);
      ctx.fillText('Создана ' + dateTime(data.createdAt) + ' МСК', 78, y + 30);
      ctx.fillText('Остаток на ' + dateTime(data.issuedAt) + ' МСК', 78, y + 60);
      ctx.textAlign = 'center'; ctx.fillStyle = '#718073'; ctx.font = 'italic 25px Georgia, serif';
      ctx.fillText('Память о долге лучше спора о нём', 450, y + 112); ctx.textAlign = 'left';
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('Не удалось сохранить чек')), 'image/png'));
      const file = new File([blob], `Долги-${data.id.slice(0, 8)}${pages.length > 1 ? '-' + (index + 1) : ''}.png`, { type: 'image/png' });
      images.push({ file, url: URL.createObjectURL(blob) });
    }
    return images;
  } catch (error) {
    images.forEach(image => URL.revokeObjectURL(image.url)); throw error;
  } finally { canvas.width = 0; canvas.height = 0; }
}
