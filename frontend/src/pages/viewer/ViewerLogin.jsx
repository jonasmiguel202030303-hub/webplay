import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import ViewerAuthShell from '../../components/viewer/ViewerAuthShell.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, PasswordField } from '../../components/ui/Field.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useTitle } from '../../hooks/useTitle.js';
import { afterLoginPath } from './afterLogin.js';

export default function ViewerLogin() {
  const { slug, tenant, viewer, profile, lineLogin, selectProfile } = useViewer();
  useTitle(`Entrar — ${tenant.brand.displayName}`);
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const from = location.state?.from;
  if (viewer) return <Navigate to={profile ? from ?? `/${slug}` : `/${slug}/perfis`} state={{ from }} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await lineLogin(form.username.trim(), form.password);
      navigate(afterLoginPath(slug, data.profiles, selectProfile, from), { replace: true, state: { from } });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <ViewerAuthShell
      title="Entrar"
      subtitle="Use o usuário e a senha da sua lista de canais. Conferimos o seu acesso direto no servidor."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error.message}</Alert>}
        <Field label="Usuário" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <PasswordField label="Senha" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Button type="submit" loading={busy} className="w-full">Entrar</Button>
      </form>
    </ViewerAuthShell>
  );
}
