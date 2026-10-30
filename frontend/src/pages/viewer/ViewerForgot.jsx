import { useState } from 'react';
import { Link } from 'react-router-dom';
import ViewerAuthShell from '../../components/viewer/ViewerAuthShell.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useTitle } from '../../hooks/useTitle.js';

const toPath = (url) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
};

export default function ViewerForgot() {
  const { slug, tenant, svc } = useViewer();
  useTitle(`Recuperar senha — ${tenant.brand.displayName}`);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDone(await svc.forgotPassword(email));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewerAuthShell
      title="Recuperar senha"
      subtitle="Informe seu e-mail para receber o link de redefinição."
      footer={<Link to={`/${slug}/entrar`} className="text-primary hover:underline">Voltar para o login</Link>}
    >
      {done ? (
        <div className="space-y-4">
          <Alert tone="success">{done.message}</Alert>
          {done.devResetUrl && (
            <Alert tone="warning" title="Ambiente de desenvolvimento">
              Sem SMTP o e-mail não é enviado. <Link className="font-semibold underline" to={toPath(done.devResetUrl)}>Redefinir senha agora</Link>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error.message}</Alert>}
          <Field label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={busy} className="w-full">Enviar link</Button>
        </form>
      )}
    </ViewerAuthShell>
  );
}
