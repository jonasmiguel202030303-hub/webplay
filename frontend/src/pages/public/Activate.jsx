import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthCard from '../../components/AuthCard.jsx';
import { Alert, Spinner } from '../../components/ui/Feedback.jsx';
import { authService } from '../../services/authService.js';
import { useTitle } from '../../hooks/useTitle.js';

export default function Activate() {
  useTitle('Ativar conta — WebPlay Brasil');
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState(token ? { status: 'loading' } : { status: 'error', message: 'Link de ativação incompleto.' });
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    authService
      .activate(token)
      .then(() => setState({ status: 'ok' }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [token]);

  return (
    <AuthCard title="Ativação de conta">
      {state.status === 'loading' && <Spinner label="Ativando sua conta…" />}
      {state.status === 'ok' && (
        <>
          <Alert tone="success">Conta ativada com sucesso. Seu período de teste já começou.</Alert>
          <Link to="/entrar" className="btn btn-primary mt-6 w-full">Entrar no painel</Link>
        </>
      )}
      {state.status === 'error' && (
        <>
          <Alert tone="error">{state.message}</Alert>
          <p className="mt-4 text-sm text-fg/60">Na tela de login, informe seu e-mail e senha para solicitar um novo link de ativação.</p>
          <Link to="/entrar" className="btn btn-secondary mt-4 w-full">Ir para o login</Link>
        </>
      )}
    </AuthCard>
  );
}
