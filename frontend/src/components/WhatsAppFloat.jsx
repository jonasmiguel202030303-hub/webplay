import { MessageCircle } from 'lucide-react';

/** Botão flutuante de WhatsApp (canto inferior direito). Não renderiza sem número válido (DDI + DDD + número). */
export default function WhatsAppFloat({ phone, message = 'Olá! Preciso de ajuda.', className = 'bottom-5 right-5' }) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      title="Falar no WhatsApp"
      className={`fixed z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/40 ring-2 ring-white/20 transition hover:scale-110 focus-visible:outline-offset-4 ${className}`}
    >
      <MessageCircle className="h-7 w-7" aria-hidden />
    </a>
  );
}
