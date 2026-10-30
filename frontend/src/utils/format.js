const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const DATETIME = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const formatMoney = (cents) => BRL.format((Number(cents) || 0) / 100);

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : DATETIME.format(d);
}

/** Converte milissegundos restantes em "2d 04h 10min" / "03:20:15". */
export function formatRemaining(ms) {
  if (ms === null || ms === undefined) return '—';
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}min`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const initials = (name) =>
  String(name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Gera o slug sugerido a partir do nome da marca (mesma regra do servidor, que sempre revalida). */
export const slugify = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export const SUBSCRIPTION_STATUS = {
  trial: { label: 'Em teste', tone: 'blue' },
  active: { label: 'Ativa', tone: 'green' },
  expired: { label: 'Vencida', tone: 'red' },
  suspended: { label: 'Suspensa', tone: 'amber' },
  canceled: { label: 'Cancelada', tone: 'slate' },
};

export const PAYMENT_STATUS = {
  pending: { label: 'Pendente', tone: 'amber' },
  in_process: { label: 'Em análise', tone: 'amber' },
  approved: { label: 'Aprovado', tone: 'green' },
  rejected: { label: 'Recusado', tone: 'red' },
  cancelled: { label: 'Cancelado', tone: 'slate' },
  expired: { label: 'Expirado', tone: 'slate' },
  refunded: { label: 'Reembolsado', tone: 'amber' },
  charged_back: { label: 'Contestado', tone: 'red' },
};
