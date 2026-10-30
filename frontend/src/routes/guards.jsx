import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, homeFor, isStaff } from '../contexts/AuthContext.jsx';
import { useViewer } from '../contexts/ViewerContext.jsx';
import { Spinner } from '../components/ui/Feedback.jsx';

/** Protege rotas do painel pelo papel do usuário. A autorização real é sempre feita pela API. */
export function RequireRole({ role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner className="min-h-screen" />;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  const allowed = role === 'staff' ? isStaff(user) : user.role === role;
  if (!allowed) return <Navigate to={homeFor(user)} replace />;
  return <Outlet />;
}

export function RequireMaster({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'master') return <Navigate to="/master" replace />;
  return children;
}

/** Exige espectador autenticado na página /<slug>. */
export function RequireViewer() {
  const { slug, viewer, sessionLoading } = useViewer();
  const location = useLocation();
  if (sessionLoading) return <Spinner className="min-h-screen" />;
  if (!viewer) return <Navigate to={`/${slug}/entrar`} replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Exige um perfil ativo; sem ele, leva à escolha de perfil. */
export function RequireProfile() {
  const { slug, profile } = useViewer();
  const location = useLocation();
  if (!profile) return <Navigate to={`/${slug}/perfis`} replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
