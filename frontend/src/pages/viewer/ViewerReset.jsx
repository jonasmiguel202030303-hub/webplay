import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ViewerAuthShell from '../../components/viewer/ViewerAuthShell.jsx';
import Button from '../../components/ui/Button.jsx';
import { PasswordField } from '../../components/ui/Field.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { fieldErrors } from '../../services/api.js';
import { useTitle } from '../../hooks/useTitle.js';

export default function ViewerReset() {
  const { slug, tenant, svc } = useViewer();
  useTitle(`Nova senha — ${tenant.brand.displayName}`);
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setErrors({});
    if (password !== confirm) {
      setErrors({ confirm: 'As senhas não conferem.' });
      return;
    }
    setBusy(true);
    try {
      await svc.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewerAuthShell title="Definir nova senha" footer={<Link to={`/${slug}/entrar`} className="text-primary hover:underline">Ir para o login</Link>}>
      {!token ? (
        <Alert tone="error">Link inválido. Solicite um novo em “Esqueci minha senha”.</Alert>
      ) : done ? (
        <Alert tone="success">Senha redefinida. Entre com a nova senha.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && !errors.password && <Alert tone="error">{error.message}</Alert>}
          <PasswordField label="Nova senha" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="Mínimo de 10 caracteres, com letras e números." />
          <PasswordField label="Confirmar senha" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
          <Button type="submit" loading={busy} className="w-full">Salvar nova senha</Button>
        </form>
      )}
    </ViewerAuthShell>
  );
}
