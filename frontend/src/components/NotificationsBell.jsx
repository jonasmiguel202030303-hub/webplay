import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import { EmptyState } from './ui/Feedback.jsx';
import { tenantService } from '../services/tenantService.js';
import { formatDateTime } from '../utils/format.js';

export default function NotificationsBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    tenantService.notifications().then((r) => setItems(r.notifications)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  const unread = items.filter((n) => !n.read).length;

  const openModal = () => {
    setOpen(true);
    if (unread) tenantService.markNotificationsRead().then(() => setItems((l) => l.map((n) => ({ ...n, read: true })))).catch(() => {});
  };

  return (
    <>
      <button type="button" onClick={openModal} className="relative rounded-full p-2 text-fg/70 hover:bg-fg/10 hover:text-fg" aria-label={unread ? `Avisos (${unread} novos)` : 'Avisos'}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Avisos">
        {items.length === 0 ? (
          <EmptyState icon={Bell} title="Nenhum aviso por enquanto" />
        ) : (
          <ul className="space-y-3">
            {items.map((n) => (
              <li key={n.id} className={`rounded-lg border p-3 ${n.read ? 'border-fg/10' : 'border-primary/40 bg-primary/10'}`}>
                <p className="text-sm font-semibold">{n.title}</p>
                {n.body && <p className="mt-1 text-sm text-fg/70">{n.body}</p>}
                <p className="mt-1 text-xs text-fg/40">{formatDateTime(n.at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
