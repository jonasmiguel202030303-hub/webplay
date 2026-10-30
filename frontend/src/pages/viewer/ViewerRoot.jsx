import { Outlet, useParams } from 'react-router-dom';
import { ViewerProvider, useViewer } from '../../contexts/ViewerContext.jsx';
import { Spinner, ErrorState } from '../../components/ui/Feedback.jsx';
import NotFound from '../public/NotFound.jsx';
import Unavailable from './Unavailable.jsx';

function Gate() {
  const { tenantState, tenant } = useViewer();
  if (tenantState === 'loading') return <Spinner className="min-h-screen" />;
  if (tenantState === 'notfound') return <NotFound message="Não encontramos uma página com este endereço." />;
  if (tenantState === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <ErrorState error={{ message: 'Não foi possível carregar esta página agora. Verifique sua conexão e tente novamente.' }} onRetry={() => window.location.reload()} />
      </div>
    );
  }
  if (!tenant.available) return <Unavailable />;
  return <Outlet />;
}

/** Raiz de /<slug>: carrega a marca (tema white-label) e a sessão do espectador. */
export default function ViewerRoot() {
  const { slug } = useParams();
  return (
    <ViewerProvider key={slug} slug={slug}>
      <Gate />
    </ViewerProvider>
  );
}
