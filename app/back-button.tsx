'use client';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="debt-back" onClick={onClick} disabled={disabled}><ArrowLeft size={20} aria-hidden="true"/> Назад</button>;
}
