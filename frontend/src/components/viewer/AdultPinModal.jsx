import { useState } from 'react';
import { Lock } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';

/** Modal de PIN para desbloquear categorias adultas (controle parental). Fecha sem desbloquear se cancelado. */
export default function AdultPinModal({ open, onClose, onSuccess, type, categoryId }) {
  const { svc } = useViewer();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPin('');
    setError('');
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      setError('Digite os 4 dígitos do PIN.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { ok } = await svc.verifyAdultPin(pin, type, categoryId);
      if (!ok) {
        setError('PIN incorreto.');
        setPin('');
        return;
      }
      setPin('');
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Conteúdo restrito" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="flex items-start gap-2 text-sm text-fg/70">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Esta categoria é protegida pelo controle parental. Digite o PIN para continuar.
        </p>
        <input
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoFocus
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="input text-center text-2xl tracking-[0.6em]"
          aria-label="PIN de 4 dígitos"
          placeholder="••••"
        />
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close} disabled={busy}>Cancelar</Button>
          <Button type="submit" loading={busy}>Desbloquear</Button>
        </div>
      </form>
    </Modal>
  );
}
