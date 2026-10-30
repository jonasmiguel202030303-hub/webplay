import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Users } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import ProfileAvatar from '../../components/viewer/ProfileAvatar.jsx';
import LineStatus from '../../components/viewer/LineStatus.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useTitle } from '../../hooks/useTitle.js';

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
