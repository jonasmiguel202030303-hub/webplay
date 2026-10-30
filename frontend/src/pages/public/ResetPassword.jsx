import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthCard from '../../components/AuthCard.jsx';
import Button from '../../components/ui/Button.jsx';
import { PasswordField } from '../../components/ui/Field.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { authService } from '../../services/authService.js';
import { fieldErrors } from '../../services/api.js';
import { useTitle } from '../../hooks/useTitle.js';

export default function ResetPassword() {
  useTitle('Redefinir senha — WebPlay Brasil');
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm && confirm !== password ? 'As senhas não coincidem.' : null;

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await authService.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!token) return <AuthCard title="Redefinir senha"><Alert tone="error">Link inválido. Solicite um novo.</Alert><Link to="/esqueci-senha" className="btn btn-secondary mt-4 w-full">Solicitar novo link</Link></AuthCard>;

  return (
    <AuthCard title="Nova senha" subtitle="Escolha uma senha forte com letras e números.">
      {done ? (
        <>
          <Alert tone="success">Senha redefinida. Entre com a nova senha.</Alert>
          <Link to="/entrar" className="btn btn-primary mt-6 w-full">Ir para o login</Link>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error.message}</Alert>}
          <PasswordField label="Nova senha" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors(error).password} hint="Mínimo de 10 caracteres." />
          <PasswordField label="Confirmar nova senha" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch} />
          <Button type="submit" loading={busy} className="w-full">Redefinir senha</Button>
        </form>
      )}
    </AuthCard>
  );
}
