import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthCard from '../../components/AuthCard.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { authService } from '../../services/authService.js';
import { useTitle } from '../../hooks/useTitle.js';

export default function ForgotPassword() {
  useTitle('Recuperar senha — WebPlay Brasil');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await authService.forgotPassword(email));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const devPath = result?.devResetUrl ? new URL(result.devResetUrl).pathname + new URL(result.devResetUrl).search : null;

  return (
    <AuthCard title="Recuperar senha" subtitle="Informe o e-mail da conta para receber o link de redefinição." footer={<Link to="/entrar" className="text-primary hover:underline">Voltar ao login</Link>}>
      {result ? (
        <div className="space-y-4">
          <Alert tone="success">{result.message}</Alert>
          {devPath && <Alert tone="warning" title="Ambiente de desenvolvimento">Link: <Link className="font-semibold underline" to={devPath}>redefinir senha</Link></Alert>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error.message}</Alert>}
          <Field label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={busy} className="w-full">Enviar link</Button>
        </form>
      )}
    </AuthCard>
  );
}
