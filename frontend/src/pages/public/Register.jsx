import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthCard from '../../components/AuthCard.jsx';
import Button from '../../components/ui/Button.jsx';
import { Checkbox, Field, PasswordField } from '../../components/ui/Field.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { authService, publicService } from '../../services/authService.js';
import { fieldErrors } from '../../services/api.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { usePlatform } from '../../hooks/usePlatform.js';
import { useTitle } from '../../hooks/useTitle.js';
import { slugify } from '../../utils/format.js';

const toPath = (url) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
};

export default function Register() {
  useTitle('Criar conta — WebPlay Brasil');
  const platform = usePlatform();
  const [form, setForm] = useState({ name: '', email: '', password: '', brandName: '', slug: '', acceptTerms: false });
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState({ checking: false, available: null, reason: null });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const onBrand = (e) => {
    const brandName = e.target.value;
    setForm((f) => ({ ...f, brandName, slug: slugTouched ? f.slug : slugify(brandName) }));
  };

  const debouncedSlug = useDebounced(form.slug);
  const lastCheck = useRef(0);
  useEffect(() => {
    if (!debouncedSlug) {
      setSlugState({ checking: false, available: null, reason: null });
      return undefined;
    }
    const id = ++lastCheck.current;
    const ctrl = new AbortController();
    setSlugState((s) => ({ ...s, checking: true }));
    publicService
      .slugAvailable(debouncedSlug, ctrl.signal)
      .then((r) => id === lastCheck.current && setSlugState({ checking: false, available: r.available, reason: r.reason }))
      .catch((err) => err.name !== 'AbortError' && id === lastCheck.current && setSlugState({ checking: false, available: null, reason: null }));
    return () => ctrl.abort();
  }, [debouncedSlug]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      setDone(await authService.register(form));
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthCard title="Confira seu e-mail" subtitle="Falta só ativar a conta.">
        <Alert tone="success">{done.message}</Alert>
        {done.devActivationUrl && (
          <Alert tone="warning" className="mt-4" title="Ambiente de desenvolvimento">
            O e-mail não é enviado sem SMTP configurado. Use o link: <Link className="font-semibold underline" to={toPath(done.devActivationUrl)}>ativar minha conta</Link>
          </Alert>
        )}
        <p className="mt-6 text-center text-sm"><Link to="/entrar" className="text-primary hover:underline">Ir para o login</Link></p>
      </AuthCard>
    );
  }

  const slugHint = slugState.checking ? 'Verificando disponibilidade…' : slugState.available === true ? 'Endereço disponível.' : `Seu link será webplaybrasil.online/${form.slug || 'seu-nome'}`;
  const slugError = errors.slug || (slugState.available === false ? slugState.reason : null);

  return (
    <AuthCard
      wide
      title="Criar conta"
      subtitle={platform ? `Teste grátis por ${platform.trialHours} horas. Sem cartão de crédito.` : 'Teste grátis. Sem cartão de crédito.'}
      footer={<>Já tem conta? <Link to="/entrar" className="font-semibold text-primary hover:underline">Entrar</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && !Object.keys(errors).length && <Alert tone="error">{error.message}</Alert>}
        <Field label="Seu nome" autoComplete="name" required value={form.name} onChange={set('name')} error={errors.name} />
        <Field label="E-mail" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} />
        <PasswordField label="Senha" autoComplete="new-password" required value={form.password} onChange={set('password')} error={errors.password} hint="Mínimo de 10 caracteres, com letras e números." />
        <Field label="Nome da sua plataforma" required value={form.brandName} onChange={onBrand} error={errors.brandName} hint="É o nome que seus espectadores verão." />
        <Field
          label="Endereço da sua página"
          required
          value={form.slug}
          onChange={(e) => {
            setSlugTouched(true);
            setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
          }}
          error={slugError}
          hint={slugHint}
        />
        <Checkbox
          checked={form.acceptTerms}
          onChange={set('acceptTerms')}
          error={errors.acceptTerms}
          label={<>Li e aceito os <Link to="/termos" target="_blank" className="text-primary underline">Termos de Uso</Link> e a <Link to="/privacidade" target="_blank" className="text-primary underline">Política de Privacidade</Link>.</>}
        />
        <Button type="submit" loading={busy} className="w-full">Criar conta e iniciar teste</Button>
      </form>
    </AuthCard>
  );
}
