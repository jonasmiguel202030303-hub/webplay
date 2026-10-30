import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import ViewerAuthShell from '../../components/viewer/ViewerAuthShell.jsx';
import Button from '../../components/ui/Button.jsx';
import { Checkbox, Field, PasswordField } from '../../components/ui/Field.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { fieldErrors } from '../../services/api.js';
import { useTitle } from '../../hooks/useTitle.js';
import { afterLoginPath } from './afterLogin.js';

export default function ViewerRegister() {
  const { slug, tenant, viewer, register } = useViewer();
  useTitle(`Criar conta — ${tenant.brand.displayName}`);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', acceptTerms: false });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (viewer) return <Navigate to={`/${slug}/perfis`} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      await register(form);
      navigate(afterLoginPath(slug), { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err);
      setBusy(false);
    }
  };

  const footer = <>Já tem cadastro? <Link to={`/${slug}/entrar`} className="font-semibold text-primary hover:underline">Entrar</Link></>;

  if (!tenant.allowViewerSignup) {
    return (
      <ViewerAuthShell title="Cadastro indisponível" footer={footer}>
        <Alert tone="info">O cadastro de novos espectadores está desativado nesta página. Fale com o responsável para receber seu acesso.</Alert>
      </ViewerAuthShell>
    );
  }

  return (
    <ViewerAuthShell title="Criar conta" subtitle="Cadastre-se para começar a assistir." footer={footer}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && !Object.keys(errors).length && <Alert tone="error">{error.message}</Alert>}
        <Field label="Nome" autoComplete="name" required value={form.name} onChange={set('name')} error={errors.name} />
        <Field label="E-mail" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} />
        <PasswordField label="Senha" autoComplete="new-password" required value={form.password} onChange={set('password')} error={errors.password} hint="Mínimo de 10 caracteres, com letras e números." />
        <Checkbox
          checked={form.acceptTerms}
          onChange={set('acceptTerms')}
          error={errors.acceptTerms}
          label={<>Li e aceito os <Link to="/termos" target="_blank" className="text-primary underline">Termos de Uso</Link> e a <Link to="/privacidade" target="_blank" className="text-primary underline">Política de Privacidade</Link>.</>}
        />
        <Button type="submit" loading={busy} className="w-full">Criar conta</Button>
      </form>
    </ViewerAuthShell>
  );
}
