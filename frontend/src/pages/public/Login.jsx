import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthCard from '../../components/AuthCard.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, PasswordField } from '../../components/ui/Field.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { useAuth, homeFor } from '../../contexts/AuthContext.jsx';
import { authService } from '../../services/authService.js';
import { useTitle } from '../../hooks/useTitle.js';

export default function Login() {
  useTitle('Entrar — WebPlay Brasil');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(null);

  if (user) return <Navigate to={location.state?.from ?? homeFor(user)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResent(null);
    try {
      const data = await login(form.email, form.password);
      const staff = data.user.role === 'master' || data.user.role === 'admin';
      const from = location.state?.from;
      const allowed = from && (staff ? from.startsWith('/master') : from.startsWith('/painel'));
      navigate(allowed ? from : homeFor(data.user), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      const r = await authService.resendActivation(form.email);
      setResent(r);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <AuthCard
      title="Entrar no painel"
      subtitle="Acesse com o e-mail e a senha da sua conta."
      footer={<>Ainda não tem conta? <Link to="/cadastro" className="font-semibold text-primary hover:underline">Criar conta grátis</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <Alert tone="error">
            {error.message}
            {error.code === 'ACCOUNT_NOT_ACTIVATED' && (
              <button type="button" onClick={resend} className="ml-2 font-semibold underline">Reenviar e-mail de ativação</button>
            )}
          </Alert>
        )}
        {resent && (
          <Alert tone="success">
            {resent.message}
            {resent.devActivationUrl && (
              <> <a className="font-semibold underline" href={new URL(resent.devActivationUrl).pathname + new URL(resent.devActivationUrl).search}>Ativar agora (apenas desenvolvimento)</a></>
            )}
          </Alert>
        )}
        <Field label="E-mail" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <PasswordField label="Senha" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Button type="submit" loading={busy} className="w-full">Entrar</Button>
        <p className="text-center text-sm"><Link to="/esqueci-senha" className="text-fg/60 hover:text-fg hover:underline">Esqueci minha senha</Link></p>
      </form>
    </AuthCard>
  );
}
