'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, Share2 } from 'lucide-react';
import BackButton from './back-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ReceiptData, renderReceipt } from '@/lib/receipt';

export default function DebtReceipt({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    let cancelled = false; let urls: string[] = [];
    renderReceipt(data).then(result => {
      urls = result.map(image => image.url);
      if (cancelled) urls.forEach(url => URL.revokeObjectURL(url)); else setImages(result);
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [data]);
  useEffect(() => { document.body.dataset.receiptPrint = 'true'; return () => { delete document.body.dataset.receiptPrint; }; }, []);
  function download(image: { file: File; url: string }) {
    const link = document.createElement('a'); link.href = image.url; link.download = image.file.name;
    document.body.appendChild(link); link.click(); link.remove();
  }
  async function share() {
    const files = images.map(image => image.file);
    setError('');
    if (!navigator.share || !navigator.canShare?.({ files })) {
      setError('Здесь отправка изображения не поддерживается. Сохраните PNG и прикрепите его в WhatsApp, либо откройте приложение в Safari.'); return;
    }
    setSharing(true);
    try {
      // Files are prepared before the click to retain iPhone user activation.
      await navigator.share({ files });
    } catch (e: any) {
      if (e.name !== 'AbortError') setError('Не удалось открыть отправку. Сохраните PNG и отправьте его из WhatsApp.');
    } finally { setSharing(false); }
  }
  return <>
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="receipt-dialog" showCloseButton={false}>
        <DialogHeader className="receipt-header">
          <BackButton onClick={onClose}/>
          <DialogTitle>Чек по долгу</DialogTitle>
          <DialogDescription>Проверьте данные и комментарий перед отправкой.</DialogDescription>
        </DialogHeader>
        <div className="receipt-preview">
          {!images.length && !error && <p role="status">Готовим изображение…</p>}
          {images.map((image, i) => <figure key={image.url}>
            <img src={image.url} alt={`Чек по долгу: ${data.name}, ${data.principal}, остаток ${data.balance}${images.length > 1 ? `, страница ${i + 1}` : ''}`}/>
            {images.length > 1 && <Button variant="outline" onClick={() => download(image)}>Сохранить страницу {i + 1}</Button>}
          </figure>)}
        </div>
        <div className="receipt-actions">
          {error && <p role="alert" className="error">{error}</p>}
          {images.length > 1 && <small>Длинный комментарий: {images.length} страниц. Все страницы отправятся вместе.</small>}
          <Button className="primary" disabled={!images.length || sharing} onClick={share}><Share2 size={19}/>{sharing ? 'Открываем…' : 'Поделиться'}</Button>
          <div className="two-fields">
            <Button variant="outline" className="secondary" disabled={!images.length} onClick={() => images.forEach(download)}><Download size={18}/> Сохранить PNG</Button>
            <Button variant="outline" className="secondary" onClick={() => window.print()}><Printer size={18}/> Печать</Button>
          </div>
          <small>Выберите WhatsApp в системном меню «Поделиться».</small>
        </div>
      </DialogContent>
    </Dialog>
    {typeof document !== 'undefined' && createPortal(<article id="receipt-print-root">
      <header><p className="receipt-motto">Слово дороже расписки</p><h1>ЧЕК ДОЛГА</h1><p>{data.currency}</p></header>
      <h2>{data.name}</h2><p>{data.direction}</p>
      <dl>{[['Дата операции', data.date], ['Срок возврата', data.due], ['Первоначально', data.principal], ['Возвращено', data.returned], ['Взаимозачет', data.offset], ['Текущий остаток', data.balance]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <h3>Назначение</h3><p>{data.purpose}</p>{data.comment && <><h3>Комментарий</h3><p>{data.comment}</p></>}
      <footer>Запись № {data.id.slice(0, 12).toUpperCase()}<br/>Создана {new Date(data.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК<br/>Остаток на {new Date(data.issuedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК<p className="receipt-motto">Память о долге лучше спора о нём</p></footer>
    </article>, document.body)}
  </>;
}
