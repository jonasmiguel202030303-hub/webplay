import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck, Users } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Switch } from '../../components/ui/Field.jsx';
import ProfileAvatar from '../../components/viewer/ProfileAvatar.jsx';
import LineStatus from '../../components/viewer/LineStatus.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';

const PIN_RE = /^\d{4}$/;

/** Ativa/desativa o PIN que protege categorias adultas (canais, filmes e séries) e permite trocar o PIN. */
function ParentalControlCard() {
  const { svc, loadSession } = useViewer();
  const toast = useToast();
  const status = useAsync(() => svc.adultControlStatus(), [svc]);
  const [mode, setMode] = useState('idle'); // idle | setup | change | disable | reactivate
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status.loading && !status.data) return <Card title="Controle parental"><p className="text-sm text-fg/50">Carregando…</p></Card>;
  if (status.error && !status.data) return null;

  const enabled = !!status.data?.enabled;
  const hasPin = !!status.data?.hasPin;

  const reset = () => {
    setMode('idle');
    setPin('');
    setConfirmPin('');
    setCurrentPin('');
    setError('');
  };

  const onToggle = (next) => {
    setError('');
    setMode(next ? (hasPin ? 'reactivate' : 'setup') : 'disable');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const settingPin = mode === 'setup' || mode === 'change';
    if (settingPin && (!PIN_RE.test(pin) || pin !== confirmPin)) {
      setError('Informe um PIN de 4 dígitos e confirme corretamente.');
      return;
    }
    if (hasPin && !PIN_RE.test(currentPin)) {
      setError('Informe o PIN atual.');
      return;
    }
    setBusy(true);
    try {
      await svc.setAdultControl({
        enabled: mode !== 'disable',
        pin: settingPin ? pin : undefined,
        currentPin: hasPin ? currentPin : undefined,
      });
      await Promise.all([status.reload(), loadSession()]);
      toast.success(mode === 'disable' ? 'Controle parental desativado.' : 'Controle parental atualizado.');
      reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Controle parental" description="Peça um PIN de 4 dígitos antes de abrir categorias de canais, filmes ou séries com conteúdo adulto.">
      {mode === 'idle' ? (
        <div className="space-y-3">
          <Switch checked={enabled} onChange={onToggle} label="Ativar controle parental" description={enabled ? 'Categorias adultas pedem o PIN ao serem abertas.' : 'Categorias adultas ficam livres para todos os perfis.'} />
          {enabled && hasPin && (
            <Button variant="secondary" size="sm" icon={ShieldCheck} onClick={() => setMode('change')}>Trocar PIN</Button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="max-w-sm space-y-3">
          {hasPin && (
            <div>
              <label className="label" htmlFor="currentPin">PIN atual</label>
              <input id="currentPin" type="password" inputMode="numeric" maxLength={4} autoComplete="off" className="input" value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </div>
          )}
          {(mode === 'setup' || mode === 'change') && (
            <>
              <div>
                <label className="label" htmlFor="newPin">{mode === 'setup' ? 'Criar PIN (4 dígitos)' : 'Novo PIN (4 dígitos)'}</label>
                <input id="newPin" type="password" inputMode="numeric" maxLength={4} autoComplete="off" className="input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
              <div>
                <label className="label" htmlFor="confirmPin">Confirmar PIN</label>
                <input id="confirmPin" type="password" inputMode="numeric" maxLength={4} autoComplete="off" className="input" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
            </>
          )}
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={reset} disabled={busy}>Cancelar</Button>
            <Button type="submit" size="sm" loading={busy}>{mode === 'disable' ? 'Desativar' : 'Salvar'}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export default function Account() {
  const { slug, tenant, viewer, profiles, account, logout, loadSession } = useViewer();
  useTitle(`Minha conta — ${tenant.brand.displayName}`);
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  const recheck = async () => {
    setChecking(true);
    await loadSession();
    setChecking(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">Minha conta</h1>

      {account && (
        <Card title="Minha assinatura" description="Conferida direto no servidor, em tempo real." actions={<Button size="sm" variant="secondary" loading={checking} onClick={recheck}>Verificar agora</Button>}>
          <LineStatus account={account} compact />
        </Card>
      )}

      <Card title="Dados do cadastro">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {account ? (
            <div><dt className="text-fg/50">Usuário</dt><dd className="font-medium">{viewer.name}</dd></div>
          ) : (
            <>
              <div><dt className="text-fg/50">Nome</dt><dd className="font-medium">{viewer.name}</dd></div>
              <div><dt className="text-fg/50">E-mail</dt><dd className="font-medium">{viewer.email}</dd></div>
            </>
          )}
        </dl>
      </Card>

      <Card title="Perfis" actions={<Link to={`/${slug}/perfis`} className="btn btn-secondary btn-sm"><Users className="h-4 w-4" /> Gerenciar perfis</Link>}>
        <ul className="flex flex-wrap gap-4">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <ProfileAvatar name={p.name} avatar={p.avatar} size="sm" /> {p.name}{p.isKids && <span className="badge">Infantil</span>}
            </li>
          ))}
        </ul>
      </Card>

      <ParentalControlCard />

      <Button
        variant="secondary"
        icon={LogOut}
        onClick={async () => {
          await logout();
          navigate(`/${slug}/entrar`, { replace: true });
        }}
      >
        Sair
      </Button>
    </div>
  );
}
